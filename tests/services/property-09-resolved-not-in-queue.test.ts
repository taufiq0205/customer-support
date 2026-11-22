// Feature: cx-support-tool, Property 9: Resolved conversations are absent from the queue
// Validates: Requirements 4.7, 7.1
import fc from 'fast-check'
import { beforeAll, beforeEach, expect, it } from 'vitest'
import type { IncomingMessage } from '@/lib/adapters/types'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'
process.env.SESSION_SECRET ??= 'x'.repeat(32)

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations, conversationHistory, messages } = await import('@/lib/db/schema')
const svc = await import('@/lib/services/conversation')

const supervisor: Session = { userId: 'sup', role: 'supervisor' }

beforeAll(() => {
  runMigrations()
  db.insert(users)
    .values({ id: 'sup', username: 'sup', passwordHash: 'x', displayName: 'sup', role: 'supervisor', createdAt: 0 })
    .run()
})

beforeEach(() => {
  db.delete(conversationHistory).run()
  db.delete(messages).run()
  db.delete(conversations).run()
})

it('queue contains exactly the non-resolved conversations', () => {
  fc.assert(
    fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }), (resolveFlags) => {
      db.delete(conversationHistory).run()
      db.delete(messages).run()
      db.delete(conversations).run()

      const msgs: IncomingMessage[] = resolveFlags.map((_, i) => ({
        externalId: `m-${i}`,
        externalConversationId: `c-${i}`,
        platform: 'zaapi',
        channel: 'whatsapp',
        direction: 'inbound',
        senderName: 'Synthetic Customer',
        body: `hello ${i}`,
        hasAttachment: false,
        sentAt: new Date(1_000_000 + i),
      }))
      const { created } = svc.ingest(msgs)
      expect(created).toHaveLength(msgs.length)

      const resolved = new Set<string>()
      const rest = new Set<string>()
      for (const [i, id] of created.entries()) {
        // created order follows insertion order, but don't rely on index alignment beyond flags
        if (resolveFlags[i]) {
          expect(svc.changeStatus(id, 'resolved', supervisor).ok).toBe(true)
          resolved.add(id)
        } else rest.add(id)
      }

      const queue = svc.getConversations({ status: 'open', assignedAgentId: null, limit: 100 }, supervisor)
      const ids = new Set(queue.items.map((c) => c.id))
      for (const id of resolved) expect(ids.has(id)).toBe(false)
      expect(ids).toEqual(rest)
    }),
    { numRuns: 60 },
  )
})
