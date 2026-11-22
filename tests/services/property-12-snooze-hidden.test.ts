// Feature: cx-support-tool, Property 12: Snoozed conversation hidden before expiry
// Validates: Requirements 7.2
import { beforeAll, beforeEach, describe, it } from 'vitest'
import { expect } from 'vitest'
import fc from 'fast-check'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'
process.env.SESSION_SECRET ??= 'test-secret-test-secret-test-secret-123'

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

describe('Property 12: snoozed conversation hidden before expiry', () => {
  it('is absent from open list while now < T and present as open once now >= T', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 60_000, max: 10 * 24 * 3_600_000 }), // T offset from real now
        fc.integer({ min: 1, max: 1_000_000 }), // distance before T
        fc.integer({ min: 0, max: 1_000_000 }), // distance at/after T
        (offset, before, after) => {
          db.delete(conversationHistory).run()
          db.delete(messages).run()
          db.delete(conversations).run()

          const { created } = svc.ingest([
            {
              externalId: 'm1',
              externalConversationId: 'c1',
              platform: 'zaapi',
              channel: 'whatsapp',
              direction: 'inbound',
              senderName: 'Synthetic',
              body: 'hi',
              hasAttachment: false,
              sentAt: new Date(1_000),
            },
          ])
          const id = created[0]
          const T = Date.now() + offset
          expect(svc.changeStatus(id, 'snoozed', supervisor, undefined, T).ok).toBe(true)

          const ids = (now: number) =>
            svc.getConversations({ status: 'open', now }, supervisor).items.map((c) => [c.id, c.status])

          expect(ids(T - before).some(([i]) => i === id)).toBe(false)
          expect(ids(T + after)).toContainEqual([id, 'open'])
        },
      ),
      { numRuns: 100 },
    )
  })
})
