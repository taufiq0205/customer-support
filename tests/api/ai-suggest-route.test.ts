import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { agent, aiRequestLog, db, insertConversation, messages, postSuggest, resetTables, setupDb } from './helpers'

const fetchMock = vi.fn<typeof fetch>()

const PII = ['Synthetic Zainab Tan', 'Zainab', 'zainab.synthetic@example.com', '012-345 6789', 'PB123456']
const THREAD = [
  ['inbound', 'Hi, I am Zainab Tan. Email zainab.synthetic@example.com, phone 012-345 6789.'],
  ['outbound', 'Thanks Zainab, which order is this about?'],
  ['inbound', 'Order PB123456 has not arrived.'],
  ['inbound', ''], // attachment-only message, left out of the prompt
] as const

let seq = 0
function seedThread(over: Parameters<typeof insertConversation>[0] = {}) {
  const conv = insertConversation({ customerName: 'Synthetic Zainab Tan', assignedAgentId: 'agent-a', ...over })
  for (const [direction, body] of THREAD) {
    const n = ++seq
    db.insert(messages)
      .values({
        id: `ai-msg-${n}`,
        conversationId: conv.id!,
        externalId: `ai-ext-${n}`,
        direction,
        body,
        status: 'delivered',
        sentAt: n,
        createdAt: n,
      })
      .run()
  }
  return conv
}

const reply = (content: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(Response.json({ choices: [{ message: { role: 'assistant', content } }] }, { status }))
const sentRequest = () => fetchMock.mock.calls[0][1]!
const sentBody = () => JSON.parse(sentRequest().body as string) as { model: string; messages: { role: string; content: string }[] }
const logRows = () => db.select().from(aiRequestLog).all()

beforeAll(setupDb)
beforeEach(() => {
  resetTables()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('AI_ENDPOINT_URL', 'http://127.0.0.1:11434/')
  vi.stubEnv('AI_MODEL_NAME', 'synthetic-model')
  vi.stubEnv('AI_API_KEY', '')
})

describe('POST /api/conversations/[id]/ai-suggest', () => {
  it('sends a redacted thread to the chat completions endpoint and returns the suggestion', async () => {
    const conv = seedThread()
    reply('Hi [NAME], sorry about [ORDER]. We are checking now.')

    const res = await postSuggest(agent('agent-a'), conv.id!)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ suggestion: 'Hi [NAME], sorry about [ORDER]. We are checking now.' })

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect(sentRequest().method).toBe('POST')
    expect(new Headers(sentRequest().headers).has('authorization')).toBe(false)
    const body = sentBody()
    expect(body.model).toBe('synthetic-model')
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    const raw = sentRequest().body as string
    for (const pii of PII) expect(raw).not.toContain(pii)
    for (const label of ['[NAME]', '[EMAIL]', '[PHONE]', '[ORDER]']) expect(raw).toContain(label)
  })

  it('sends the API key as a bearer token when one is configured', async () => {
    vi.stubEnv('AI_API_KEY', 'synthetic-key')
    const conv = seedThread()
    reply('ok')
    await postSuggest(agent('agent-a'), conv.id!)
    expect(new Headers(sentRequest().headers).get('authorization')).toBe('Bearer synthetic-key')
  })

  it('strips a reasoning model think block from the suggestion', async () => {
    const conv = seedThread()
    reply('<think>\nthe customer wants tracking\n</think>\n\n  Here is your tracking link.  ')
    expect(await (await postSuggest(agent('agent-a'), conv.id!)).json()).toEqual({ suggestion: 'Here is your tracking link.' })
  })

  it('logs one successful request with no prompt or response text', async () => {
    const conv = seedThread()
    reply('Hi [NAME], we are on it.')
    await postSuggest(agent('agent-a'), conv.id!)
    const [row] = logRows()
    expect(logRows()).toHaveLength(1)
    expect(row).toMatchObject({ conversationId: conv.id, modelName: 'synthetic-model', success: 1, errorMessage: null })
    expect(row.responseMs).toBeGreaterThanOrEqual(0)
  })

  it.each([
    ['a timeout', () => fetchMock.mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError')), 'within 10 seconds'],
    ['an unreachable endpoint', () => fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')), 'Could not reach'],
    ['an HTTP 500', () => fetchMock.mockResolvedValueOnce(new Response('provider echoed Zainab Tan', { status: 500 })), 'HTTP 500'],
    ['an empty answer', () => reply('<think>only thinking</think>'), 'no suggestion'],
    ['a malformed answer', () => reply(42), 'no suggestion'],
  ])('returns 502 with a readable error and logs a failure without PII on %s', async (_, arrange, text) => {
    const conv = seedThread()
    arrange()
    const res = await postSuggest(agent('agent-a'), conv.id!)
    expect(res.status).toBe(502)
    const json = (await res.json()) as { suggestion: null; errorMessage: string }
    expect(json).toEqual({ suggestion: null, errorMessage: expect.stringContaining(text) })

    const rows = logRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ success: 0, errorMessage: json.errorMessage })
    const logged = JSON.stringify(rows) + json.errorMessage
    for (const pii of [...PII, 'Tan', 'order', 'arrived', 'thinking']) expect(logged).not.toContain(pii)
  })

  it('returns 404 without calling the endpoint when AI is not configured', async () => {
    vi.stubEnv('AI_ENDPOINT_URL', '  ')
    const conv = seedThread()
    const res = await postSuggest(agent('agent-a'), conv.id!)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'ai_not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logRows()).toHaveLength(0)
  })

  it("returns 404 without calling the endpoint for another agent's conversation", async () => {
    const conv = seedThread({ assignedAgentId: 'agent-b' })
    const res = await postSuggest(agent('agent-a'), conv.id!)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a request without a session', async () => {
    const conv = seedThread()
    expect((await postSuggest(null, conv.id!)).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
