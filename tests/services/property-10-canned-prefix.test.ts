// Feature: cx-support-tool, Property 10: Canned response shortcode filter returns exact prefix matches
// Validates: Requirements 6.3
import fc from 'fast-check'
import { beforeAll, expect, it } from 'vitest'

process.env.DATABASE_URL = ':memory:'

const { db, runMigrations } = await import('@/lib/db')
const { users, cannedResponses } = await import('@/lib/db/schema')
const { create, searchByPrefix } = await import('@/lib/services/canned-response')

beforeAll(() => {
  runMigrations()
  db.insert(users).values({ id: 'sup', username: 'sup', passwordHash: 'x', displayName: 'sup', role: 'supervisor', createdAt: 0 }).run()
})

// A small alphabet makes shared prefixes common; LIKE wildcards and backslash must match literally.
const text = (minLength: number, maxLength: number) =>
  fc.string({ unit: fc.constantFrom('a', 'A', 'b', 'B', '%', '_', '\\', 'é', 'É'), minLength, maxLength })

it('returns exactly the responses whose shortcode starts with the prefix, ignoring case', () => {
  fc.assert(
    fc.property(fc.uniqueArray(text(1, 4), { maxLength: 12 }), text(0, 3), (library, prefix) => {
      db.delete(cannedResponses).run()
      for (const shortcode of library) create({ name: shortcode, shortcode, body: 'synthetic' }, 'sup')

      const expected = library.filter((s) => s.toLowerCase().startsWith(prefix.toLowerCase()))
      expect(searchByPrefix(prefix).map((r) => r.shortcode).sort()).toEqual(expected.sort())
    }),
    { numRuns: 200 },
  )
})
