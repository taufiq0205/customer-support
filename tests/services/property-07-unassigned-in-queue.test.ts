// Feature: cx-support-tool, Property 7: Unassigned conversations appear in queue
// Validates: Requirements 4.5
import fc from 'fast-check'
import { beforeAll, expect, it } from 'vitest'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'
process.env.SESSION_SECRET ??= 'x'.repeat(32)

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations, conversationHistory, notifications } = await import('@/lib/db/schema')
const { getConversations } = await import('@/lib/services/conversation')

const AGENTS = ['agent-a', 'agent-b']
const sessions: Session[] = [
  { userId: 'sup', role: 'supervisor' },
  { userId: 'agent-a', role: 'agent' },
]

beforeAll(() => {
  runMigrations()
  db.insert(users)
    .values(['sup', ...AGENTS].map((id) => ({ id, username: id, passwordHash: 'x', displayName: id, role: id === 'sup' ? ('supervisor' as const) : ('agent' as const), createdAt: 0 })))
    .run()
})

it('every open unassigned conversation is in the queue for supervisors and agents', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          status: fc.constantFrom(...(['open', 'snoozed', 'resolved'] as const)),
          assignee: fc.option(fc.constantFrom(...AGENTS), { nil: null }),
        }),
        { minLength: 1, maxLength: 30 },
      ),
      (specs) => {
        db.delete(conversationHistory).run()
        db.delete(notifications).run()
        db.delete(conversations).run()
        specs.forEach(({ status, assignee }, i) =>
          db.insert(conversations)
            .values({ id: `c-${i}`, externalId: `e-${i}`, platform: 'zaapi', channel: 'whatsapp', status, snoozedUntil: status === 'snoozed' ? Date.now() + 1e7 : null, assignedAgentId: assignee, lastMessageAt: i, createdAt: 0, updatedAt: 0 })
            .run(),
        )
        const expected = specs.flatMap((s, i) => (s.status === 'open' && s.assignee === null ? [`c-${i}`] : []))

        for (const session of sessions) {
          const queue = getConversations({ status: 'open', assignedAgentId: null, limit: 100 }, session).items.map((c) => c.id)
          expect(queue).toEqual(expect.arrayContaining(expected))
        }
      },
    ),
    { numRuns: 100 },
  )
})
