import { and, eq, lte, or, isNull } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import type { OutboundReply, PlatformAdapter, SendResult } from '@/lib/adapters/types'
import type { Session } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { conversations, messages } from '@/lib/db/schema'
import { emit } from '@/lib/events/bus'
import { canAccess, type Message, type Result } from './conversation'

function emitStatus(message: Message) {
  const conv = db.select().from(conversations).where(eq(conversations.id, message.conversationId)).get()
  emit(
    { type: 'message.created', conversationId: message.conversationId, payload: { messageId: message.id, status: message.status } },
    conv?.assignedAgentId ?? undefined,
  )
}

export function storeOutbound(conversationId: string, body: string, session: Session): Result<Message> {
  const conv = db.select().from(conversations).where(eq(conversations.id, conversationId)).get()
  if (!conv || !canAccess(conv, session)) return { ok: false, error: 'not_found' }
  const now = Date.now()
  const message = db.transaction((tx) => {
    // The inbox preview shows the agent's reply too; the platform echo may be deduped and never update it.
    tx.update(conversations)
      .set({ lastMessageAt: now, lastMessagePreview: body, updatedAt: now })
      .where(
        and(
          eq(conversations.id, conversationId),
          or(isNull(conversations.lastMessageAt), lte(conversations.lastMessageAt, now)),
        ),
      )
      .run()
    return tx
      .insert(messages)
      .values({
        id: uuid(),
        conversationId,
        // Placeholder: external_id is NOT NULL; the platform id arrives after send.
        externalId: `local:${uuid()}`,
        direction: 'outbound',
        senderName: null,
        body,
        status: 'pending',
        sentAt: now,
        createdAt: now,
      })
      .returning()
      .get()
  })
  emitStatus(message)
  return { ok: true, value: message }
}

// Settles a pending row only: a late send result must not overwrite a row the platform echo already confirmed.
export function updateMessageStatus(
  messageId: string,
  status: Message['status'],
  externalId?: string,
): Result<Message> {
  const message = db
    .update(messages)
    .set({ status, ...(externalId === undefined ? {} : { externalId }) })
    .where(and(eq(messages.id, messageId), eq(messages.status, 'pending')))
    .returning()
    .get()
  if (!message) return { ok: false, error: 'not_found' }
  emitStatus(message)
  return { ok: true, value: message }
}

// An unconfirmed outbound reply with this body blocks a blind resend: the platform may have delivered it.
export function findUnconfirmed(conversationId: string, body: string): Message | undefined {
  return db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.direction, 'outbound'),
        eq(messages.status, 'unconfirmed'),
        eq(messages.body, body),
      ),
    )
    .get()
}

// No automatic retry: a resend after a timeout can double-send. The agent retries by posting again.
// A timeout or thrown error is unconfirmed, not failed: the platform may still have sent it.
export async function deliverOutbound(
  message: Message,
  reply: OutboundReply,
  adapter: PlatformAdapter,
  timeoutMs = 30_000,
): Promise<Message> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<SendResult>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'unconfirmed', errorMessage: 'timeout' }), timeoutMs)
  })
  const result = await Promise.race([adapter.sendReply(reply), timeout])
    .catch((): SendResult => ({ status: 'unconfirmed', errorMessage: 'send_error' }))
    .finally(() => clearTimeout(timer))
  const externalId = result.status === 'sent' ? (result.externalMessageId ?? undefined) : undefined
  const updated = updateMessageStatus(message.id, result.status, externalId)
  return updated.ok ? updated.value : (db.select().from(messages).where(eq(messages.id, message.id)).get() ?? message)
}
