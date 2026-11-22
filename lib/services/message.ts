import { and, eq, lte, or, isNull } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
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

export function updateMessageStatus(
  messageId: string,
  status: Message['status'],
  externalId?: string,
): Result<Message> {
  const message = db
    .update(messages)
    .set({ status, ...(externalId === undefined ? {} : { externalId }) })
    .where(eq(messages.id, messageId))
    .returning()
    .get()
  if (!message) return { ok: false, error: 'not_found' }
  emitStatus(message)
  return { ok: true, value: message }
}
