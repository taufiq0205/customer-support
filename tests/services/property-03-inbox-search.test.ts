// Feature: cx-support-tool, Property 3: Inbox search returns only matching conversations
// Validates: Requirements 1.6
import * as fc from 'fast-check'
import { beforeAll, beforeEach, expect, it } from 'vitest'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'
process.env.SESSION_SECRET ??= 'test-secret-test-secret-test-secret-0000'

const { db, runMigrations } = await import('@/lib/db')
const { conversations, conversationHistory, messages } = await import('@/lib/db/schema')
const svc = await import('@/lib/services/conversation')

const supervisor: Session = { userId: 'sup', role: 'supervisor' }

beforeAll(() => runMigrations())
beforeEach(() => {
  db.delete(conversationHistory).run()
  db.delete(messages).run()
  db.delete(conversations).run()
})

// ASCII only (service case-folding is ASCII); small alphabet so queries collide often.
const text = fc.stringOf(fc.constantFrom(...'aAbB%_ xX1-'), { maxLength: 8 })
const field = fc.option(text, { nil: null })
const convs = fc.array(fc.record({ name: field, ident: field, preview: field }), { minLength: 1, maxLength: 10 })

const queryFor = (rows: { name: string | null; ident: string | null; preview: string | null }[]) => {
  const values = rows.flatMap((r) => [r.name, r.ident, r.preview]).filter((v): v is string => !!v)
  const substr = values.length
    ? fc
        .tuple(fc.constantFrom(...values), fc.nat(), fc.nat())
        .map(([v, a, b]) => {
          const i = a % v.length
          return v.slice(i, i + 1 + (b % (v.length - i)))
        })
    : text
  return fc.oneof(substr, text).filter((q) => q.length > 0)
}

it('search returns exactly the conversations whose name, identifier or preview contains the query', () => {
  fc.assert(
    fc.property(
        convs.chain((rows) => fc.tuple(fc.constant(rows), queryFor(rows))),
        ([rows, q]) => {
          db.delete(conversations).run()
          rows.forEach((r, i) =>
            db
              .insert(conversations)
              .values({
                id: `id-${i}`,
                externalId: `ext-${i}`,
                platform: 'zaapi',
                channel: 'whatsapp',
                customerName: r.name,
                customerIdentifier: r.ident,
                lastMessagePreview: r.preview,
                lastMessageAt: 1000 + i,
                createdAt: 0,
                updatedAt: 0,
              })
              .run(),
          )
          const needle = q.toLowerCase()
          const expected = rows
            .map((r, i) => ({ r, id: `id-${i}` }))
            .filter(({ r }) => [r.name, r.ident, r.preview].some((v) => v !== null && v.toLowerCase().includes(needle)))
            .map((x) => x.id)
            .sort()
          const { items } = svc.getConversations({ search: q, limit: 1000 }, supervisor)
          expect(items.map((c) => c.id).sort()).toEqual(expected)
        },
    ),
    { numRuns: 100 },
  )
})
