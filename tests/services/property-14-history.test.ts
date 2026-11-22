// Feature: cx-support-tool, Property 14: Every status transition is recorded in history
// Validates: Requirements 7.4
import fc from 'fast-check'
import { beforeAll, beforeEach, expect, it } from 'vitest'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'
process.env.SESSION_SECRET ??= 'x'.repeat(32)

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations, conversationHistory, messages } = await import('@/lib/db/schema')
const svc = await import('@/lib/services/conversation')
const { eq } = await import('drizzle-orm')

const sup: Session = { userId: 'sup', role: 'supervisor' }
const ALL = ['open', 'snoozed', 'resolved'] as const
const rowsOf = (id: string) => db.select().from(conversationHistory).where(eq(conversationHistory.conversationId, id)).all()

beforeAll(() => {
  runMigrations()
  db.insert(users).values({ id: 'sup', username: 'sup', passwordHash: 'x', displayName: 'sup', role: 'supervisor', createdAt: 0 }).run()
})
beforeEach(() => {
  db.delete(conversationHistory).run()
  db.delete(messages).run()
  db.delete(conversations).run()
})

it('records every valid transition and nothing for invalid ones', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ pick: fc.nat(), bad: fc.nat(), badSnooze: fc.boolean() }), { minLength: 1, maxLength: 12 }),
      (steps) => {
        db.delete(conversationHistory).run()
        db.delete(messages).run()
        db.delete(conversations).run()
        const { created } = svc.ingest([
          {
            externalId: 'm', externalConversationId: 'c', platform: 'zaapi', channel: 'whatsapp', direction: 'inbound',
            senderName: 'Synthetic', body: 'hi', hasAttachment: false, sentAt: new Date(1_000_000),
          },
        ])
        const id = created[0]
        let status: (typeof ALL)[number] = 'open'
        let n = 0
        for (const s of steps) {
          // Invalid attempts: unreachable status, or snooze without a future time.
          const unreachable = ALL.filter((t) => !svc.TRANSITIONS[status].includes(t))
          const before = rowsOf(id).length
          if (unreachable.length) {
            const r = svc.changeStatus(id, unreachable[s.bad % unreachable.length], sup, undefined, Date.now() + 1e7)
            expect(r).toEqual({ ok: false, error: 'invalid_transition' })
          } else if (s.badSnooze && svc.TRANSITIONS[status].includes('snoozed')) {
            expect(svc.changeStatus(id, 'snoozed', sup, undefined, Date.now() - 1).ok).toBe(false)
          }
          expect(rowsOf(id).length).toBe(before)

          const opts = svc.TRANSITIONS[status]
          const to = opts[s.pick % opts.length]
          const r = svc.changeStatus(id, to, sup, undefined, to === 'snoozed' ? Date.now() + 1e7 : undefined)
          expect(r.ok).toBe(true)
          status = to
          n++
          expect(rowsOf(id).length).toBeGreaterThanOrEqual(n)
        }
        expect(rowsOf(id).length).toBeGreaterThanOrEqual(n)
      },
    ),
    { numRuns: 100 },
  )
})
