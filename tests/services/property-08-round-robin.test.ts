// Feature: cx-support-tool, Property 8: Round-robin assignment distributes conversations evenly
// Validates: Requirements 4.6
import fc from 'fast-check'
import { beforeAll, expect, it } from 'vitest'

process.env.DATABASE_URL = ':memory:'
process.env.SESSION_SECRET ??= 'x'.repeat(32)

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations, conversationHistory, notifications, assignmentRules, roundRobinState } = await import('@/lib/db/schema')
const { autoAssign, configureAutoAssign } = await import('@/lib/services/assignment')

beforeAll(() => runMigrations())

it('no agent receives more than ceil(M/N) of M round-robin assignments', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 100 }), (n, m) => {
      db.delete(conversationHistory).run()
      db.delete(notifications).run()
      db.delete(conversations).run()
      db.delete(assignmentRules).run()
      db.delete(roundRobinState).run()
      db.delete(users).run()
      const agents = Array.from({ length: n }, (_, i) => `agent-${String(i).padStart(2, '0')}`)
      db.insert(users)
        .values(agents.map((id) => ({ id, username: id, passwordHash: 'x', displayName: id, role: 'agent' as const, createdAt: 0 })))
        .run()
      expect(configureAutoAssign({ strategy: 'round_robin' }, 'sup').ok).toBe(true)

      const counts = new Map<string, number>()
      for (let i = 0; i < m; i++) {
        db.insert(conversations).values({ id: `c-${i}`, externalId: `e-${i}`, platform: 'zaapi', channel: 'whatsapp', createdAt: 0, updatedAt: 0 }).run()
        const r = autoAssign(`c-${i}`)
        if (!r?.ok) throw new Error(`autoAssign failed: ${JSON.stringify(r)}`)
        counts.set(r.value.assignedAgentId!, (counts.get(r.value.assignedAgentId!) ?? 0) + 1)
      }
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(Math.ceil(m / n))
    }),
    { numRuns: 100 },
  )
}, 30_000) // up to 10k assignments; the default 5s is too tight when the full suite runs in parallel
