import { and, eq, inArray, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { CHANNELS, PLATFORMS, type IncomingMessage } from '@/lib/adapters/types'
import type { Session } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { conversationHistory, conversations, messages } from '@/lib/db/schema'
import { emit } from '@/lib/events/bus'
import type { SSEEvent } from '@/lib/events/types'

export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type Status = Conversation['status']

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: 'not_found' | 'invalid_transition' | 'snooze_time_required' }

export const TRANSITIONS: Record<Status, readonly Status[]> = {
  open: ['snoozed', 'resolved'],
  snoozed: ['open', 'resolved'],
  resolved: ['open'],
}

export type ConversationFilters = {
  status?: Status
  assignedAgentId?: string | null // null = unassigned
  platform?: Conversation['platform']
  channel?: Conversation['channel']
  search?: string
  cursor?: string
  limit?: number // default 50
  now?: number // ms, default Date.now()
}

const ENUM_PARAMS: Record<'status' | 'platform' | 'channel', readonly string[]> = {
  status: Object.keys(TRANSITIONS),
  platform: PLATFORMS,
  channel: CHANNELS,
}

// Invalid enum values are left out of `filters`; `invalidField` names the first one so the API can reject it.
export function parseConversationQuery(
  query: URLSearchParams,
  session: Session,
): { filters: ConversationFilters; invalidField?: string } {
  const filters: ConversationFilters = {
    search: query.get('search') || undefined,
    cursor: query.get('page') ?? undefined,
  }
  let invalidField: string | undefined
  for (const [field, allowed] of Object.entries(ENUM_PARAMS)) {
    const value = query.get(field)
    if (!value) continue
    if (allowed.includes(value)) Object.assign(filters, { [field]: value })
    else invalidField ??= field
  }
  const assignedTo = query.get('assignedTo')
  if (assignedTo) {
    filters.assignedAgentId = assignedTo === 'unassigned' ? null : assignedTo === 'me' ? session.userId : assignedTo
  }
  return { filters, invalidField }
}

type Pending = [SSEEvent, string | undefined]

const notFound = { ok: false, error: 'not_found' } as const

export function canAccess(conv: Pick<Conversation, 'assignedAgentId'>, session: Session): boolean {
  return session.role === 'supervisor' || conv.assignedAgentId === session.userId || conv.assignedAgentId === null
}

const visibleTo = (conv: Conversation) => conv.assignedAgentId ?? undefined

function statusEvent(conv: Conversation, fromStatus: Status): Pending {
  return [
    { type: 'conversation.status_changed', conversationId: conv.id, payload: { fromStatus, toStatus: conv.status } },
    visibleTo(conv),
  ]
}

const flush = (events: Pending[]) => events.forEach(([event, userId]) => emit(event, userId))

export function ingest(incoming: IncomingMessage[]): { created: string[]; updated: string[] } {
  const created = new Set<string>()
  const updated = new Set<string>()
  for (const m of incoming) {
    const events: Pending[] = []
    db.transaction((tx) => {
      const now = Date.now()
      const sentAt = m.sentAt.getTime()
      const inbound = m.direction === 'inbound'
      const body = m.body ?? ''
      let conv = tx
        .select()
        .from(conversations)
        .where(and(eq(conversations.externalId, m.externalConversationId), eq(conversations.platform, m.platform)))
        .get()
      const isNew = !conv
      conv ??= tx
        .insert(conversations)
        .values({
          id: uuid(),
          externalId: m.externalConversationId,
          platform: m.platform,
          channel: m.channel,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()

      // The platform echo of a reply sent from this app settles its local row instead of adding a second copy.
      // Zaapi returns no message id and a timed-out send has none, so match the oldest unsettled row by body.
      const firstEcho =
        !inbound &&
        !tx
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.conversationId, conv.id), eq(messages.externalId, m.externalId)))
          .get()
      const local =
        firstEcho &&
        tx
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conv.id),
              eq(messages.direction, 'outbound'),
              like(messages.externalId, 'local:%'),
              // 'sent' included: Zaapi confirms a send without an id, so its row keeps the local: placeholder.
              inArray(messages.status, ['pending', 'sent', 'unconfirmed']),
              eq(messages.body, body),
            ),
          )
          .orderBy(messages.createdAt, messages.id)
          .get()
      if (local) {
        const settled = tx
          .update(messages)
          .set({ status: 'sent', externalId: m.externalId, sentAt })
          .where(eq(messages.id, local.id))
          .returning()
          .get()!
        events.push([
          { type: 'message.created', conversationId: conv.id, payload: { messageId: settled.id, status: settled.status } },
          visibleTo(conv),
        ])
        updated.add(conv.id)
        return
      }

      const message = tx
        .insert(messages)
        .values({
          id: uuid(),
          conversationId: conv.id,
          externalId: m.externalId,
          direction: m.direction,
          senderName: m.senderName,
          body,
          hasAttachment: m.hasAttachment ? 1 : 0,
          status: inbound ? 'delivered' : 'sent',
          sentAt,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning()
        .get()
      if (!message) return // duplicate delivery: nothing changes, nothing emits

      const reopen = inbound && conv.status !== 'open'
      // Out-of-order webhooks must not regress the preview.
      const isLatest = conv.lastMessageAt === null || sentAt >= conv.lastMessageAt
      const next = tx
        .update(conversations)
        .set({
          unreadCount: conv.unreadCount + (inbound ? 1 : 0),
          customerName: conv.customerName ?? (inbound ? m.senderName : null),
          ...(isLatest ? { lastMessageAt: sentAt, lastMessagePreview: body } : {}),
          ...(reopen ? { status: 'open' as const, snoozedUntil: null } : {}),
          updatedAt: now,
        })
        .where(eq(conversations.id, conv.id))
        .returning()
        .get()!

      if (isNew) events.push([{ type: 'conversation.created', conversationId: next.id, payload: {} }, visibleTo(next)])
      events.push([
        { type: 'message.created', conversationId: next.id, payload: { messageId: message.id, status: message.status } },
        visibleTo(next),
      ])
      if (reopen) {
        tx.insert(conversationHistory)
          .values({
            id: uuid(),
            conversationId: next.id,
            fromStatus: conv.status,
            toStatus: 'open',
            changedBy: null,
            reason: 'new_message',
            changedAt: now,
          })
          .run()
        events.push(statusEvent(next, conv.status))
      }
      ;(isNew ? created : updated).add(next.id)
    })
    flush(events)
  }
  for (const id of created) updated.delete(id)
  return { created: [...created], updated: [...updated] }
}

// Snooze expiry is applied lazily on read, so no scheduler is needed. Running it twice is a no-op.
export function wakeExpiredSnoozes(now: number, id?: string) {
  const events: Pending[] = []
  db.transaction((tx) => {
    const woken = tx
      .update(conversations)
      .set({ status: 'open', snoozedUntil: null, updatedAt: now })
      .where(
        and(
          eq(conversations.status, 'snoozed'),
          lte(conversations.snoozedUntil, now),
          id === undefined ? undefined : eq(conversations.id, id),
        ),
      )
      .returning()
      .all()
    for (const conv of woken) {
      tx.insert(conversationHistory)
        .values({
          id: uuid(),
          conversationId: conv.id,
          fromStatus: 'snoozed',
          toStatus: 'open',
          changedBy: null,
          reason: 'snooze_expired',
          changedAt: now,
        })
        .run()
      events.push(statusEvent(conv, 'snoozed'))
    }
  })
  flush(events)
}

const lastAt = sql<number>`coalesce(${conversations.lastMessageAt}, 0)`

export function getConversations(
  filters: ConversationFilters,
  session: Session,
): { items: Conversation[]; nextCursor: string | null } {
  const now = filters.now ?? Date.now()
  const limit = filters.limit ?? 50
  wakeExpiredSnoozes(now)

  const conds: (SQL | undefined)[] = [
    filters.status && eq(conversations.status, filters.status),
    filters.platform && eq(conversations.platform, filters.platform),
    filters.channel && eq(conversations.channel, filters.channel),
  ]
  if (filters.assignedAgentId !== undefined) {
    conds.push(
      filters.assignedAgentId === null
        ? isNull(conversations.assignedAgentId)
        : eq(conversations.assignedAgentId, filters.assignedAgentId),
    )
  }
  if (session.role === 'agent') {
    conds.push(or(eq(conversations.assignedAgentId, session.userId), isNull(conversations.assignedAgentId)))
  }
  if (filters.search) {
    // instr, not LIKE: % and _ in user input must match literally.
    const q = filters.search
    conds.push(
      sql`(instr(lower(${conversations.customerName}), lower(${q})) > 0
        OR instr(lower(${conversations.customerIdentifier}), lower(${q})) > 0
        OR instr(lower(${conversations.lastMessagePreview}), lower(${q})) > 0)`,
    )
  }
  // A malformed cursor is ignored and the first page is returned.
  const cursor = filters.cursor?.match(/^(\d+):(.+)$/)
  if (cursor) {
    const [, at, id] = cursor
    conds.push(sql`(${lastAt} < ${Number(at)} OR (${lastAt} = ${Number(at)} AND ${conversations.id} < ${id}))`)
  }

  const rows = db
    .select()
    .from(conversations)
    .where(and(...conds))
    .orderBy(sql`${lastAt} desc`, sql`${conversations.id} desc`)
    .limit(limit + 1)
    .all()
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return { items, nextCursor: rows.length > limit && last ? `${last.lastMessageAt ?? 0}:${last.id}` : null }
}

export function findAccessible(id: string, session: Session): Conversation | undefined {
  const conv = db.select().from(conversations).where(eq(conversations.id, id)).get()
  return conv && canAccess(conv, session) ? conv : undefined
}

export function getConversation(id: string, session: Session): Result<{ conversation: Conversation; messages: Message[] }> {
  wakeExpiredSnoozes(Date.now(), id)
  const conversation = findAccessible(id, session)
  if (!conversation) return notFound
  const thread = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    // Messages without a platform timestamp sort last.
    .orderBy(sql`${messages.sentAt} asc nulls last`, messages.createdAt, messages.id)
    .all()
  return { ok: true, value: { conversation, messages: thread } }
}

export function changeStatus(
  id: string,
  toStatus: Status,
  session: Session,
  reason?: string,
  snoozedUntil?: number,
): Result<Conversation> {
  const now = Date.now()
  wakeExpiredSnoozes(now, id)
  const conv = findAccessible(id, session)
  if (!conv) return notFound
  if (!TRANSITIONS[conv.status].includes(toStatus)) return { ok: false, error: 'invalid_transition' }
  if (toStatus === 'snoozed' && !(snoozedUntil !== undefined && snoozedUntil > now)) {
    return { ok: false, error: 'snooze_time_required' }
  }

  const next = db.transaction((tx) => {
    tx.insert(conversationHistory)
      .values({
        id: uuid(),
        conversationId: id,
        fromStatus: conv.status,
        toStatus,
        changedBy: session.userId,
        reason: reason ?? null,
        changedAt: now,
      })
      .run()
    return tx
      .update(conversations)
      .set({ status: toStatus, snoozedUntil: toStatus === 'snoozed' ? snoozedUntil : null, updatedAt: now })
      .where(eq(conversations.id, id))
      .returning()
      .get()!
  })
  flush([statusEvent(next, conv.status)])
  return { ok: true, value: next }
}
