// Feature: cx-support-tool, Property 2: Inbox filter returns only matching conversations
// Validates: Requirements 1.5
import fc from 'fast-check'
import { beforeAll, describe, expect, it } from 'vitest'
import { CHANNELS, PLATFORMS } from '@/lib/adapters/types'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations, conversationHistory, messages } = await import('@/lib/db/schema')
const svc = await import('@/lib/services/conversation')

type Conv = typeof conversations.$inferInsert
const AGENTS = ['agent-a', 'agent-b']
const STATUSES = ['open', 'snoozed', 'resolved'] as const
const supervisor: Session = { userId: 'sup', role: 'supervisor' }

beforeAll(() => {
  runMigrations()
  db.insert(users)
    .values(
      ['sup', ...AGENTS].map((id) => ({
        id,
        username: id,
        passwordHash: 'x',
        displayName: id,
        role: id === 'sup' ? ('supervisor' as const) : ('agent' as const),
        createdAt: 0,
      })),
    )
    .run()
})

const convArb = fc.record({
  status: fc.constantFrom(...STATUSES),
  assignedAgentId: fc.constantFrom<string | null>(null, ...AGENTS),
  platform: fc.constantFrom(...PLATFORMS),
  channel: fc.constantFrom(...CHANNELS),
  lastMessageAt: fc.option(fc.integer({ min: 1, max: 20 }), { nil: null }), // small range forces ties
})
const filterArb = fc.record(
  {
    status: fc.constantFrom(...STATUSES),
    assignedAgentId: fc.constantFrom<string | null>(null, ...AGENTS),
    platform: fc.constantFrom(...PLATFORMS),
    channel: fc.constantFrom(...CHANNELS),
  },
  { requiredKeys: [] },
)

function seed(arr: (typeof convArb extends fc.Arbitrary<infer T> ? T : never)[]) {
  db.delete(conversationHistory).run()
  db.delete(messages).run()
  db.delete(conversations).run()
  const rows: Conv[] = arr.map((c, i) => ({
    id: `conv-${String(i).padStart(3, '0')}`,
    externalId: `ext-${i}`,
    ...c,
    snoozedUntil: null, // never expires, so lazy wake cannot change status
    createdAt: 0,
    updatedAt: 0,
  }))
  if (rows.length) db.insert(conversations).values(rows).run()
  return rows
}

const matches = (c: Conv, f: Record<string, unknown>) =>
  Object.entries(f).every(([k, v]) => c[k as keyof Conv] === v)

function drain(f: object, session: Session, limit: number) {
  const ids: string[] = []
  let cursor: string | undefined
  for (let guard = 0; guard < 100; guard++) {
    const page = svc.getConversations({ ...f, limit, cursor, now: 1 }, session)
    ids.push(...page.items.map((c) => c.id))
    if (!page.nextCursor) return ids
    cursor = page.nextCursor
  }
  throw new Error('cursor did not terminate')
}

describe('Property 2: inbox filter', () => {
  it('supervisor gets exactly the conversations matching every filter, across pages', () => {
    fc.assert(
      fc.property(fc.array(convArb, { maxLength: 25 }), filterArb, fc.integer({ min: 1, max: 30 }), (arr, f, limit) => {
        const rows = seed(arr)
        const expected = rows.filter((c) => matches(c, f)).map((c) => c.id)
        const got = drain(f, supervisor, limit)
        expect([...got].sort()).toEqual([...expected].sort())
        expect(new Set(got).size).toBe(got.length)
      }),
      { numRuns: 100 },
    )
  })

  it('an agent never sees conversations assigned to another agent', () => {
    fc.assert(
      fc.property(fc.array(convArb, { maxLength: 25 }), filterArb, fc.constantFrom(...AGENTS), (arr, f, me) => {
        const rows = seed(arr)
        const session: Session = { userId: me, role: 'agent' }
        const expected = rows
          .filter((c) => matches(c, f) && (c.assignedAgentId === me || c.assignedAgentId === null))
          .map((c) => c.id)
        const got = drain(f, session, 100)
        expect([...got].sort()).toEqual([...expected].sort())
      }),
      { numRuns: 100 },
    )
  })
})
