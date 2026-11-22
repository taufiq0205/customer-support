// Feature: cx-support-tool, Property 6: Assignment produces a notification for the assignee
// Validates: Requirements 4.2
import fc from 'fast-check'
import { beforeAll, expect, it } from 'vitest'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'
process.env.SESSION_SECRET ??= 'x'.repeat(32)

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations, conversationHistory, notifications } = await import('@/lib/db/schema')
const { assign } = await import('@/lib/services/assignment')
const { and, eq } = await import('drizzle-orm')

const AGENTS = ['agent-a', 'agent-b', 'agent-c']
const sup: Session = { userId: 'sup', role: 'supervisor' }
const notified = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'assigned'), eq(notifications.conversationId, 'c'))).all().length

beforeAll(() => {
  runMigrations()
  db.insert(users)
    .values(['sup', ...AGENTS].map((id) => ({ id, username: id, passwordHash: 'x', displayName: id, role: id === 'sup' ? ('supervisor' as const) : ('agent' as const), createdAt: 0 })))
    .run()
})

it('every change of assignee notifies the new assignee once, and a repeat assign notifies no one', () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom(...AGENTS), { minLength: 1, maxLength: 12 }), (targets) => {
      db.delete(conversationHistory).run()
      db.delete(notifications).run()
      db.delete(conversations).run()
      db.insert(conversations).values({ id: 'c', externalId: 'e', platform: 'zaapi', channel: 'whatsapp', createdAt: 0, updatedAt: 0 }).run()

      let prev: string | null = null
      for (const target of targets) {
        const before = notified(target)
        const total = db.select().from(notifications).all().length
        expect(assign('c', target, sup).ok).toBe(true)
        expect(notified(target)).toBe(before + (target === prev ? 0 : 1))
        expect(db.select().from(notifications).all().length).toBe(total + (target === prev ? 0 : 1))
        prev = target
      }
    }),
    { numRuns: 100 },
  )
})
