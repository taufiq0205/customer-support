import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendReply } from '@/components/compose/send-reply'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)
afterEach(() => fetchMock.mockReset())

const respond = (status: number, json: unknown) => fetchMock.mockResolvedValueOnce(Response.json(json, { status }))
const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1]?.body as string)

describe('sendReply', () => {
  it('posts the reply to the conversation and resolves to no error once accepted', async () => {
    respond(202, { id: 'm1', status: 'pending' })
    expect(await sendReply('conv 1', 'hello')).toBeNull()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/conversations/conv%201/messages')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(sentBody()).toEqual({ body: 'hello' })
  })

  it('asks the server to resend only when told to', async () => {
    respond(202, {})
    await sendReply('c', 'hello', true)
    expect(sentBody()).toEqual({ body: 'hello', confirmResend: true })
  })

  it('flags an unconfirmed duplicate so the agent can choose to send anyway', async () => {
    respond(409, { error: 'unconfirmed_duplicate', messageId: 'm0' })
    expect(await sendReply('c', 'hello')).toEqual({ message: expect.stringContaining('never confirmed'), duplicate: true })
  })

  it.each([
    [400, { error: 'invalid_body' }, 'Type a reply'],
    [404, { error: 'not_found' }, 'no longer available', 'case'],
    [401, { error: 'unauthorized' }, 'Sign in again', 'session'],
    [500, { error: 'something_new' }, 'could not be sent'],
    [502, 'not json', 'could not be sent'],
  ])('maps a %i response to a readable error', async (status, json, text, access?: string) => {
    respond(status, json)
    expect(await sendReply('c', 'hello')).toEqual({ message: expect.stringContaining(text), duplicate: false, ...(access && { access }) })
  })

  it('reports a network failure as an error instead of throwing', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await sendReply('c', 'hello')).toEqual({ message: expect.stringContaining('Could not reach'), duplicate: false })
  })
})
