import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestSuggestion } from '@/components/compose/suggest-reply'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)
afterEach(() => fetchMock.mockReset())

const respond = (status: number, json: unknown) => fetchMock.mockResolvedValueOnce(Response.json(json, { status }))

describe('requestSuggestion', () => {
  it('posts to the conversation suggestion route and returns the suggestion', async () => {
    respond(200, { suggestion: 'Hi [NAME], we are checking.' })
    expect(await requestSuggestion('conv 1')).toEqual({ suggestion: 'Hi [NAME], we are checking.' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/conversations/conv%201/ai-suggest')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('shows the error message the route returns for an AI endpoint failure', async () => {
    respond(502, { suggestion: null, errorMessage: 'The AI endpoint did not respond within 10 seconds.' })
    expect(await requestSuggestion('c')).toEqual({ error: 'The AI endpoint did not respond within 10 seconds.' })
  })

  it.each([
    [404, { error: 'ai_not_configured' }, 'not configured'],
    [404, { error: 'not_found' }, 'no longer available', 'case'],
    [401, { error: 'unauthorized' }, 'Sign in again', 'session'],
    [500, { error: 'something_new' }, 'still type a reply'],
    [502, 'not json', 'still type a reply'],
  ])('maps a %i response to a readable error', async (status, json, text, access?: string) => {
    respond(status, json)
    expect(await requestSuggestion('c')).toEqual({ error: expect.stringContaining(text), ...(access && { access }) })
  })

  it('reports a network failure as an error instead of throwing', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await requestSuggestion('c')).toEqual({ error: expect.stringContaining('Could not reach') })
  })
})
