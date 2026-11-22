import { describe, expect, it } from 'vitest'
import { normalizeEventType, pick, toChannel, toDate, toDirection, toId } from '@/lib/adapters/lenient'

describe('pick', () => {
  it('returns the first non-null value among dotted paths', () => {
    expect(pick({ a: null, b: { c: 0 } }, ['a', 'b.c'])).toBe(0)
    expect(pick({ a: { b: 'x' } }, ['a.missing', 'a.b'])).toBe('x')
    expect(pick('not an object', ['length'])).toBeUndefined()
  })

  it.each(['__proto__', 'toString', 'constructor', 'a.__proto__', 'a.hasOwnProperty'])('never resolves inherited key %s', (path) => {
    expect(pick({ a: {} }, [path])).toBeUndefined()
  })
})

describe('toId', () => {
  it.each([
    [' abc ', 'abc'],
    [0, '0'],
    [42, '42'],
    ['', null],
    ['   ', null],
    ['\uD800', null],
    [-1, null],
    [1.5, null],
    [Number.MAX_SAFE_INTEGER + 2, null],
    [true, null],
  ])('maps %j to %j', (v, expected) => {
    expect(toId(v)).toBe(expected)
  })
})

describe('toDate', () => {
  it('reads values up to 1e12 as seconds and above as milliseconds', () => {
    expect(toDate(1e12)?.getTime()).toBe(1e15)
    expect(toDate(1e12 + 1)?.getTime()).toBe(1e12 + 1)
    expect(toDate('1795000000')?.getTime()).toBe(1795000000000)
    expect(toDate(' 1795000000000 ')?.getTime()).toBe(1795000000000)
  })

  it('reads ISO strings', () => {
    expect(toDate('2026-11-20T09:15:00+07:00')?.toISOString()).toBe('2026-11-20T02:15:00.000Z')
  })

  it.each([0, -1, '-1', Number.NaN, Infinity, 'yesterday', 'foo 12', '20/11/2026', '', null, {}, 1e300])('rejects %j', (v) => {
    expect(toDate(v)).toBeNull()
  })
})

describe('toDirection', () => {
  it.each([
    ['Incoming', 'inbound'],
    [' received ', 'inbound'],
    ['OUT', 'outbound'],
    ['echo', 'outbound'],
    ['sideways', null],
    ['toString', null],
    [1, null],
  ])('maps %j to %j', (v, expected) => {
    expect(toDirection(v)).toBe(expected)
  })
})

describe('toChannel', () => {
  it.each([
    ['WhatsApp', 'whatsapp'],
    ['360dialog_whatsapp', 'whatsapp'],
    ['wa.business', 'whatsapp'],
    ['FB Messenger', 'facebook'],
    ['ig', 'instagram'],
    ['line', 'line'],
    ['line-oa', 'line'],
    ['tiktok_shop', 'tiktok'],
    ['website chat', 'widget'],
    ['online', null],
    ['online_store', null],
    ['airline', null],
    ['telegram', null],
    ['__proto__', null],
    ['toString', null],
    ['', null],
    [7, null],
  ])('maps %j to %j', (v, expected) => {
    expect(toChannel(v)).toBe(expected)
  })
})

describe('normalizeEventType', () => {
  it('lowercases and turns underscores into dots', () => {
    expect(normalizeEventType('MESSAGE_RECEIVED')).toBe('message.received')
    expect(normalizeEventType(3)).toBeNull()
  })
})
