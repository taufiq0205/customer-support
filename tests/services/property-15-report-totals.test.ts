// Feature: cx-support-tool, Property 15: Report totals match the underlying data
// Validates: Requirements 8.1
import fc from 'fast-check'
import { beforeAll, expect, it } from 'vitest'
import { CHANNELS, PLATFORMS } from '@/lib/adapters/types'

process.env.DATABASE_URL = ':memory:'

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations } = await import('@/lib/db/schema')
const { getMetrics } = await import('@/lib/services/report')

const AGENTS = ['agent-a', 'agent-b']
const HOUR = 3_600_000
const DAYS = Array.from({ length: 10 }, (_, i) => `2026-11-${String(20 + i).padStart(2, '0')}`)
const midnight = (day: string) => Date.parse(`${day}T00:00:00+08:00`)

beforeAll(() => {
  runMigrations()
  db.insert(users)
    .values(AGENTS.map((id) => ({ id, username: id, passwordHash: 'x', displayName: id, role: 'agent' as const, createdAt: 0 })))
    .run()
})

// Whole hours from the first Malaysian midnight, nudged by a millisecond either way, so day boundaries are hit often.
const createdAt = fc
  .tuple(fc.integer({ min: 0, max: DAYS.length * 24 }), fc.constantFrom(0, -1, 1))
  .map(([h, nudge]) => midnight(DAYS[0]) + h * HOUR + nudge)

const conversation = fc.record({
  createdAt,
  status: fc.constantFrom('open' as const, 'snoozed' as const, 'resolved' as const),
  channel: fc.constantFrom(...CHANNELS.slice(0, 3)),
  platform: fc.constantFrom(...PLATFORMS),
  assignedAgentId: fc.constantFrom(null, ...AGENTS),
})

const filters = fc.record(
  {
    agentId: fc.constantFrom('unassigned', ...AGENTS),
    channel: fc.constantFrom(...CHANNELS.slice(0, 3)),
    platform: fc.constantFrom(...PLATFORMS),
  },
  { requiredKeys: [] },
)

it('reports received and resolved totals equal to direct counts, and breakdowns that add up to them', () => {
  fc.assert(
    fc.property(
      fc.array(conversation, { maxLength: 30 }),
      fc.constantFrom(...DAYS),
      fc.constantFrom(...DAYS),
      filters,
      (rows, a, b, f) => {
        const [from, to] = [a, b].sort()
        db.delete(conversations).run()
        rows.forEach((row, i) =>
          db.insert(conversations).values({ id: `c${i}`, externalId: `e${i}`, updatedAt: 0, ...row }).run(),
        )

        const matching = rows.filter(
          (r) =>
            r.createdAt >= midnight(from) &&
            r.createdAt < midnight(to) + 24 * HOUR &&
            (!f.agentId || (r.assignedAgentId ?? 'unassigned') === f.agentId) &&
            (!f.channel || r.channel === f.channel) &&
            (!f.platform || r.platform === f.platform),
        )
        const report = getMetrics(from, to, f)
        expect(report.totals.received).toBe(matching.length)
        expect(report.totals.resolved).toBe(matching.filter((r) => r.status === 'resolved').length)
        for (const rowsByKey of Object.values(report.breakdown)) {
          expect(rowsByKey.reduce((n, r) => n + r.received, 0)).toBe(report.totals.received)
          expect(rowsByKey.reduce((n, r) => n + r.resolved, 0)).toBe(report.totals.resolved)
        }
      },
    ),
    { numRuns: 200 },
  )
})
