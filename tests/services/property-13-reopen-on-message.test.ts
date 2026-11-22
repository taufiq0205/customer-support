// Feature: cx-support-tool, Property 13: New message reopens resolved or snoozed conversation
// Validates: Requirements 7.3
import fc from 'fast-check'
import { beforeAll, describe, expect, it } from 'vitest'
import type { IncomingMessage } from '@/lib/adapters/types'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations, conversationHistory, messages } = await import('@/lib/db/schema')
const svc = await import('@/lib/services/conversation')

const sup: Session = { userId: 'sup', role: 'supervisor' }

beforeAll(() => {
  runMigrations()
  db.insert(users)
    .values({ id: 'sup', username: 'sup', passwordHash: 'x', displayName: 'sup', role: 'supervisor', createdAt: 0 })
    .run()
})

let seq = 0
const msg = (direction: 'inbound' | 'outbound', body: string): IncomingMessage => ({
  externalId: `m-${++seq}`,
  externalConversationId: 'c-1',
  platform: 'zaapi',
  channel: 'whatsapp',
  direction,
  senderName: 'Synthetic Customer',
  body,
  hasAttachment: false,
  sentAt: new Date(1_000_000 + seq),
})

// Seed one conversation and put it in `from`; returns its id.
function seed(from: 'open' | 'snoozed' | 'resolved', snoozeMs: number): string {
  db.delete(conversationHistory).run()
  db.delete(messages).run()
  db.delete(conversations).run()
  const [id] = svc.ingest([msg('inbound', 'first')]).created
  if (from === 'snoozed') expect(svc.changeStatus(id, 'snoozed', sup, undefined, Date.now() + snoozeMs).ok).toBe(true)
  if (from === 'resolved') expect(svc.changeStatus(id, 'resolved', sup).ok).toBe(true)
  return id
}
const row = (id: string) => db.select().from(conversations).all().find((c) => c.id === id)!
const reopenRows = (id: string) =>
  db.select().from(conversationHistory).all().filter((h) => h.conversationId === id && h.reason === 'new_message')

const arbFrom = fc.constantFrom('snoozed' as const, 'resolved' as const)
const arbBody = fc.string({ minLength: 1, maxLength: 30 })
const arbSnooze = fc.integer({ min: 60_000, max: 10_000_000 })

describe('Property 13: new message reopens', () => {
  it('inbound message on resolved/snoozed conversation sets open and clears snoozedUntil', () => {
    fc.assert(
      fc.property(arbFrom, arbSnooze, arbBody, (from, snooze, body) => {
        const id = seed(from, snooze)
        expect(row(id).status).toBe(from)
        svc.ingest([msg('inbound', body)])
        const after = row(id)
        expect(after.status).toBe('open')
        expect(after.snoozedUntil).toBeNull()
        const h = reopenRows(id)
        expect(h).toHaveLength(1)
        expect([h[0].fromStatus, h[0].toStatus]).toEqual([from, 'open'])
      }),
      { numRuns: 60 },
    )
  })

  it('outbound echo does not reopen', () => {
    fc.assert(
      fc.property(arbFrom, arbSnooze, arbBody, (from, snooze, body) => {
        const id = seed(from, snooze)
        const before = row(id)
        svc.ingest([msg('outbound', body)])
        const after = row(id)
        expect(after.status).toBe(from)
        expect(after.snoozedUntil).toBe(before.snoozedUntil)
        expect(reopenRows(id)).toHaveLength(0)
      }),
      { numRuns: 60 },
    )
  })
})
