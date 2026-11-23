import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

process.env.DATABASE_URL = ':memory:'

const { db, runMigrations } = await import('@/lib/db')
const { users, cannedResponses } = await import('@/lib/db/schema')
const { create, list, remove, searchByPrefix, update } = await import('@/lib/services/canned-response')

beforeAll(() => {
  runMigrations()
  db.insert(users).values({ id: 'sup', username: 'sup', passwordHash: 'x', displayName: 'sup', role: 'supervisor', createdAt: 0 }).run()
})
beforeEach(() => db.delete(cannedResponses).run())

const add = (shortcode: string, body = `body for ${shortcode}`) => {
  const r = create({ name: shortcode, shortcode, body }, 'sup')
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const shortcodes = (prefix: string) => searchByPrefix(prefix).map((r) => r.shortcode)

describe('searchByPrefix', () => {
  beforeEach(() => ['greet', 'greeting', 'refund', 'Return'].forEach((s) => add(s)))

  it('returns responses whose shortcode starts with the prefix', () => {
    expect(shortcodes('gre')).toEqual(['greet', 'greeting'])
  })

  it('matches case-insensitively in both directions', () => {
    expect(shortcodes('GREET')).toEqual(['greet', 'greeting'])
    expect(shortcodes('ret')).toEqual(['Return'])
  })

  it('returns nothing when no shortcode matches', () => {
    expect(shortcodes('xyz')).toEqual([])
    expect(shortcodes('reet')).toEqual([])
  })

  it('returns the whole library for an empty prefix', () => {
    expect(shortcodes('')).toEqual(['Return', 'greet', 'greeting', 'refund'])
  })

  it('treats LIKE wildcards in the prefix literally', () => {
    add('50%off')
    add('a_b')
    expect(shortcodes('%')).toEqual([])
    expect(shortcodes('_')).toEqual([])
    expect(shortcodes('50%')).toEqual(['50%off'])
    expect(shortcodes('a_')).toEqual(['a_b'])
  })
})

describe('CRUD', () => {
  it('creates, lists, updates and removes a response', () => {
    const created = add('hi', 'Hello {{customer_name}}')
    expect(list()).toEqual([created])

    const updated = update(created.id, { name: 'Hi', shortcode: 'hello', body: 'Hi there' })
    expect(updated).toMatchObject({ ok: true, value: { id: created.id, name: 'Hi', shortcode: 'hello', body: 'Hi there' } })

    expect(remove(created.id)).toBe(true)
    expect(remove(created.id)).toBe(false)
    expect(list()).toEqual([])
  })

  it('rejects a duplicate shortcode on create and on update', () => {
    const a = add('a')
    add('b')
    expect(create({ name: 'x', shortcode: 'a', body: 'x' }, 'sup')).toEqual({ ok: false, error: 'duplicate_shortcode' })
    expect(update(a.id, { name: 'x', shortcode: 'b', body: 'x' })).toEqual({ ok: false, error: 'duplicate_shortcode' })
    expect(update(a.id, { name: 'renamed', shortcode: 'a', body: 'x' }).ok).toBe(true)
  })

  it('reports an unknown id on update', () => {
    add('taken')
    expect(update('missing', { name: 'x', shortcode: 'taken', body: 'x' })).toEqual({ ok: false, error: 'not_found' })
  })
})
