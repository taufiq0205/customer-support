import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZAAPI_SIGNATURE_HEADER, ZaapiPayloadError, zaapiAdapter } from '@/lib/adapters/zaapi'

const SECRET = 'synthetic-webhook-secret'
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex')
const webhook = (body: string, signature?: string) =>
  new Request('http://127.0.0.1/api/webhooks/zaapi', {
    method: 'POST',
    body,
    headers: signature === undefined ? {} : { [ZAAPI_SIGNATURE_HEADER]: signature },
  })

const envelope = {
  event: 'message.created',
  data: {
    messages: [
      {
        id: 'msg-001',
        conversation_id: 'conv-001',
        channel: 'whatsapp',
        direction: 'inbound',
        sender: { name: 'Test Customer' },
        text: 'Where is my synthetic order?',
        attachments: [],
        created_at: '2026-11-20T09:15:00Z',
      },
      {
        id: 'msg-002',
        conversation_id: 'conv-001',
        channel: 'LINE',
        direction: 'outbound',
        sender: null,
        text: null,
        attachments: [{ type: 'image', url: 'https://cdn.example.invalid/synthetic.png' }],
        created_at: '2026-11-20T09:16:30Z',
      },
    ],
  },
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('zaapiAdapter.verifyWebhook', () => {
  beforeEach(() => vi.stubEnv('ZAAPI_WEBHOOK_SECRET', SECRET))
  const body = JSON.stringify(envelope)

  it('accepts a correctly signed body and returns the raw payload', async () => {
    expect(await zaapiAdapter.verifyWebhook(webhook(body, sign(body)))).toEqual({ valid: true, rawPayload: body })
  })

  it('rejects a tampered body', async () => {
    const tampered = body.replace('msg-001', 'msg-999')
    expect(await zaapiAdapter.verifyWebhook(webhook(tampered, sign(body)))).toEqual({ valid: false, rawPayload: tampered })
  })

  it('rejects a signature made with another secret', async () => {
    expect((await zaapiAdapter.verifyWebhook(webhook(body, sign(body, 'other-secret')))).valid).toBe(false)
  })

  it('rejects a wrong-length or missing signature header', async () => {
    expect((await zaapiAdapter.verifyWebhook(webhook(body, sign(body).slice(0, 10)))).valid).toBe(false)
    expect((await zaapiAdapter.verifyWebhook(webhook(body, `${sign(body)}00`))).valid).toBe(false)
    expect((await zaapiAdapter.verifyWebhook(webhook(body, ''))).valid).toBe(false)
    expect(await zaapiAdapter.verifyWebhook(webhook(body))).toEqual({ valid: false, rawPayload: body })
  })

  it('returns valid:false without throwing when the secret is missing', async () => {
    vi.stubEnv('ZAAPI_WEBHOOK_SECRET', '')
    // An attacker who knows the secret is unset could sign with an empty key.
    expect(await zaapiAdapter.verifyWebhook(webhook(body, sign(body, '')))).toEqual({ valid: false, rawPayload: body })
  })
})

describe('zaapiAdapter.parseWebhook', () => {
  it('maps the envelope to IncomingMessage[] without fetching attachments', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await zaapiAdapter.parseWebhook(JSON.stringify(envelope))).toEqual([
      {
        externalId: 'msg-001',
        externalConversationId: 'conv-001',
        platform: 'zaapi',
        channel: 'whatsapp',
        direction: 'inbound',
        senderName: 'Test Customer',
        body: 'Where is my synthetic order?',
        hasAttachment: false,
        sentAt: new Date('2026-11-20T09:15:00Z'),
      },
      {
        externalId: 'msg-002',
        externalConversationId: 'conv-001',
        platform: 'zaapi',
        channel: 'line',
        direction: 'outbound',
        senderName: null,
        body: null,
        hasAttachment: true,
        sentAt: new Date('2026-11-20T09:16:30Z'),
      },
    ])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws ZaapiPayloadError for invalid JSON, a non-object, or a message event without messages', async () => {
    for (const raw of ['{not json', '[]', 'null', JSON.stringify({ event: 'message.created', data: {} })]) {
      await expect(zaapiAdapter.parseWebhook(raw)).rejects.toBeInstanceOf(ZaapiPayloadError)
    }
  })

  it('returns [] for events that are not message events', async () => {
    expect(await zaapiAdapter.parseWebhook(JSON.stringify({ event: 'conversation.closed', data: {} }))).toEqual([])
  })

  it('skips messages with missing fields, unknown channels, bad directions, or bad dates', async () => {
    const good = envelope.data.messages[0]
    const raw = JSON.stringify({
      event: 'message.created',
      data: {
        messages: [
          null,
          { ...good, id: '' },
          { ...good, conversation_id: undefined },
          { ...good, channel: 'carrier-pigeon' },
          { ...good, direction: 'sideways' },
          { ...good, created_at: 'not a date' },
          { ...good, id: 'msg-keep' },
        ],
      },
    })
    expect((await zaapiAdapter.parseWebhook(raw)).map((m) => m.externalId)).toEqual(['msg-keep'])
  })
})

describe('zaapiAdapter.sendReply', () => {
  const reply = { conversationId: 'internal-1', externalConversationId: 'conv-001', body: 'Synthetic reply' }
  const respond = (status: number, json: unknown = {}) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status }))

  beforeEach(() => vi.stubEnv('ZAAPI_API_KEY', 'synthetic-api-key'))

  it('returns sent with the message id on 200 and sends the env key as a bearer token', async () => {
    const fetchMock = respond(200, { id: 'zaapi-msg-123' })
    vi.stubGlobal('fetch', fetchMock)
    expect(await zaapiAdapter.sendReply(reply)).toEqual({ status: 'sent', externalMessageId: 'zaapi-msg-123' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/conversations/conv-001/messages')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer synthetic-api-key')
    expect(JSON.parse(init.body)).toEqual({ text: 'Synthetic reply' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([400, 401, 404, 500, 503])('returns failed on HTTP %i without leaking the body or key', async (status) => {
    vi.stubGlobal('fetch', respond(status, { error: 'secret upstream detail' }))
    const result = await zaapiAdapter.sendReply(reply)
    expect(result).toEqual({ status: 'failed', errorMessage: `Zaapi returned HTTP ${status}` })
  })

  it('returns failed when a 2xx response has no message id', async () => {
    vi.stubGlobal('fetch', respond(200, {}))
    expect((await zaapiAdapter.sendReply(reply)).status).toBe('failed')
  })

  it('returns failed when fetch rejects or times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    expect(await zaapiAdapter.sendReply(reply)).toEqual({ status: 'failed', errorMessage: 'Zaapi request failed' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')))
    expect(await zaapiAdapter.sendReply(reply)).toEqual({ status: 'failed', errorMessage: 'Zaapi request timed out' })
  })

  it('returns failed without calling fetch when the API key is missing', async () => {
    vi.stubEnv('ZAAPI_API_KEY', '')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await zaapiAdapter.sendReply(reply)).status).toBe('failed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each(['', '.', '..', '\uD800'])('returns failed without throwing for conversation id %j', async (id) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await zaapiAdapter.sendReply({ ...reply, externalConversationId: id })).status).toBe('failed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
