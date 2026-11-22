// Feature: cx-support-tool, Property 5: Assigned conversation reflects assigned agent
// Validates: Requirements 4.1, 4.4
import fc from 'fast-check'
import { beforeAll, expect, it } from 'vitest'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'
process.env.SESSION_SECRET ??= 'x'.repeat(32)

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations, conversationHistory, notifications } = await import('@/lib/db/schema')
const { assign } = await import('@/lib/services/assignment')
const { eq } = await import('drizzle-orm')

const AGENTS = ['agent-a', 'agent-b', 'agent-c']

beforeAll(() => {
  runMigrations()
  db.insert(users)
    .values(['sup', ...AGENTS].map((id) => ({ id, username: id, passwordHash: 'x', displayName: id, role: id === 'sup' ? ('supervisor' as const) : ('agent' as const), createdAt: 0 })))
    .run()
})

it('after assign, the conversation is assigned to the target agent', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...(['open', 'snoozed'] as const)),
      fc.option(fc.constantFrom(...AGENTS), { nil: null }),
      fc.constantFrom(...AGENTS),
      fc.constantFrom('supervisor', 'system', 'self'),
      (status, initial, target, actorKind) => {
        db.delete(conversationHistory).run()
        db.delete(notifications).run()
        db.delete(conversations).run()
        // An agent can only self-assign an unassigned conversation.
        const from = actorKind === 'self' ? null : initial
        db.insert(conversations)
          .values({ id: 'c', externalId: 'e', platform: 'zaapi', channel: 'whatsapp', status, snoozedUntil: status === 'snoozed' ? Date.now() + 1e7 : null, assignedAgentId: from, createdAt: 0, updatedAt: 0 })
          .run()
        const actor: Session | null =
          actorKind === 'supervisor' ? { userId: 'sup', role: 'supervisor' } : actorKind === 'self' ? { userId: target, role: 'agent' } : null

        const r = assign('c', target, actor)
        expect(r).toMatchObject({ ok: true, value: { assignedAgentId: target } })
        expect(db.select().from(conversations).where(eq(conversations.id, 'c')).get()?.assignedAgentId).toBe(target)
      },
    ),
    { numRuns: 100 },
  )
})
