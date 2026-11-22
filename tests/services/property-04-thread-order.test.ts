// Feature: cx-support-tool, Property 4: Message thread is in chronological order
// Validates: Requirements 1.7
import fc from 'fast-check'
import { beforeAll, beforeEach, expect, it } from 'vitest'
import type { IncomingMessage } from '@/lib/adapters/types'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'

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

// Small time range forces many equal sentAt values.
const arbMessages = fc.array(
  fc.record({
    sentAt: fc.integer({ min: 1_000_000, max: 1_000_030 }),
    direction: fc.constantFrom('inbound' as const, 'outbound' as const),
    body: fc.string({ minLength: 0, maxLength: 10 }),
  }),
  { minLength: 1, maxLength: 30 },
)

it('returns the thread in non-decreasing sentAt order for any ingest order', () => {
  fc.assert(
    fc.property(arbMessages, (specs) => {
      db.delete(conversationHistory).run()
      db.delete(messages).run()
      db.delete(conversations).run()

      const batch: IncomingMessage[] = specs.map((s, i) => ({
        externalId: `m-${i}`,
        externalConversationId: 'c-1',
        platform: 'zaapi',
        channel: 'whatsapp',
        direction: s.direction,
        senderName: 'Synthetic Customer',
        body: s.body,
        hasAttachment: false,
        sentAt: new Date(s.sentAt),
      }))
      // Ingest one call per message in the generated (arbitrary) order.
      const { created } = svc.ingest(batch)
      expect(created).toHaveLength(1)

      const res = svc.getConversation(created[0], supervisor)
      expect(res.ok).toBe(true)
      if (!res.ok) return
      const thread = res.value.messages
      expect(thread).toHaveLength(batch.length)
      const times = thread.map((m) => m.sentAt as number)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(times).toEqual(specs.map((s) => s.sentAt).sort((a, b) => a - b))
    }),
    { numRuns: 100 },
  )
})
