import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCannedResponses, shortcodeQuery, substitutePlaceholder } from '@/components/compose/canned-responses'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)
afterEach(() => fetchMock.mockReset())

describe('substitutePlaceholder', () => {
  it('replaces a single occurrence', () => {
    expect(substitutePlaceholder('Hi {{customer_name}}!', 'Sam')).toBe('Hi Sam!')
  })

  it('replaces every occurrence', () => {
    expect(substitutePlaceholder('{{customer_name}}, yes {{customer_name}}', 'Sam')).toBe('Sam, yes Sam')
  })

  it('leaves a body without the token unchanged', () => {
    expect(substitutePlaceholder('Thanks for waiting.', 'Sam')).toBe('Thanks for waiting.')
  })

  it('inserts `$` patterns in a name literally', () => {
    expect(substitutePlaceholder('Hi {{customer_name}}', "$& $' $$")).toBe("Hi $& $' $$")
  })
})

describe('shortcodeQuery', () => {
  it.each([
    ['/', ''],
    ['/gre', 'gre'],
    ['/50%_off', '50%_off'],
    ['hello', null],
    ['/gre ', null],
    ['/gre\nmore', null],
    [' /gre', null],
  ])('reads %j as %j', (text, expected) => {
    expect(shortcodeQuery(text)).toBe(expected)
  })
})

describe('fetchCannedResponses', () => {
  it('requests the prefix, encoded', async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ id: '1', shortcode: '50%off' }]))
    expect(await fetchCannedResponses('50%')).toEqual([{ id: '1', shortcode: '50%off' }])
    expect(fetchMock.mock.calls[0][0]).toBe('/api/canned-responses?prefix=50%25')
  })

  it('returns no suggestions on an error response or network failure', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'unauthorized' }, { status: 401 }))
    expect(await fetchCannedResponses('a')).toEqual([])
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await fetchCannedResponses('a')).toEqual([])
  })
})
