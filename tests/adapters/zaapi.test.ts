import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdapterPayloadError } from '@/lib/adapters/lenient'
import { ZAAPI_SIGNATURE_HEADER, ZaapiLookupError, ZaapiPayloadError, zaapiAdapter } from '@/lib/adapters/zaapi'

const SECRET = 'synthetic-webhook-secret'
const API_KEY = 'synthetic-api-key'
const NOW_S = 1_795_000_000
const sign = (body: string, t = NOW_S, secret = SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
const webhook = (body: string, signature?: string) =>
  new Request('http://127.0.0.1/api/webhooks/zaapi', {
    method: 'POST',
    body,
    headers: signature === undefined ? {} : { [ZAAPI_SIGNATURE_HEADER]: signature },
  })

const inboundMessage = {
  id: 'msg-001',
  conversationId: 'conv-001',
  text: 'Where is my synthetic order?',
  messageType: 'text',
  messageCategory: 'message',
  messageDirection: 'inbound',
  sentAt: '2026-11-20T09:15:00Z',
}
const event = (message: unknown, eventType = 'message.received') =>
  JSON.stringify({
    webhookId: 'wh-001',
    eventType,
    eventHappenedAt: '2026-11-20T09:15:01Z',
    attemptNumber: 1,
    data: { accountId: 'acct-001', conversationId: 'conv-001', message },
  })
const conversation = { id: 'conv-001', channel: 'whatsapp', displayName: 'Test Customer' }
const lookupResponse = (data: unknown, status = 200) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ requestId: 'req-1', requestReceivedAt: '2026-11-20T09:15:02Z', storeId: 's-1', data }), {
      status,
    }),
  )

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('zaapiAdapter.verifyWebhook', () => {
  const body = event(inboundMessage)
  beforeEach(() => {
    vi.stubEnv('ZAAPI_WEBHOOK_SECRET', SECRET)
    vi.useFakeTimers()
    vi.setSystemTime(NOW_S * 1000)
  })

  it('accepts a correctly signed body and returns the raw payload', async () => {
    expect(await zaapiAdapter.verifyWebhook(webhook(body, sign(body)))).toEqual({ valid: true, rawPayload: body })
  })

  it('verifies the HMAC over the received bytes, not a re-encoded string', async () => {
    // 0xff is invalid UTF-8, so decoding and re-encoding would change the bytes.
    const bytes = Buffer.concat([Buffer.from('{"x":"'), Buffer.from([0xff]), Buffer.from('"}')])
    const v1 = createHmac('sha256', SECRET).update(`${NOW_S}.`).update(bytes).digest('hex')
    const req = new Request('http://127.0.0.1/api/webhooks/zaapi', {
      method: 'POST',
      body: bytes,
      headers: { [ZAAPI_SIGNATURE_HEADER]: `t=${NOW_S},v1=${v1}` },
    })
    expect(await zaapiAdapter.verifyWebhook(req)).toEqual({ valid: true, rawPayload: '{"x":"�"}' })
  })

  it('rejects a tampered body', async () => {
    const tampered = body.replace('msg-001', 'msg-999')
    expect(await zaapiAdapter.verifyWebhook(webhook(tampered, sign(body)))).toEqual({ valid: false, rawPayload: tampered })
  })

  it('rejects a signature made with another secret', async () => {
    expect((await zaapiAdapter.verifyWebhook(webhook(body, sign(body, NOW_S, 'other-secret')))).valid).toBe(false)
  })

  it('accepts a timestamp exactly 300 s old and rejects 301 s old or more than 300 s ahead', async () => {
    expect((await zaapiAdapter.verifyWebhook(webhook(body, sign(body, NOW_S - 300)))).valid).toBe(true)
    expect((await zaapiAdapter.verifyWebhook(webhook(body, sign(body, NOW_S + 300)))).valid).toBe(true)
    expect((await zaapiAdapter.verifyWebhook(webhook(body, sign(body, NOW_S - 301)))).valid).toBe(false)
    expect((await zaapiAdapter.verifyWebhook(webhook(body, sign(body, NOW_S + 301)))).valid).toBe(false)
  })

  it.each([
    ['empty', () => ''],
    ['bare hex without t', (s: string) => s.split('v1=')[1]],
    ['missing v1', () => `t=${NOW_S}`],
    ['missing t', (s: string) => s.slice(s.indexOf('v1='))],
    ['non-integer t', (s: string) => s.replace(`t=${NOW_S}`, `t=${NOW_S}.5`)],
    ['negative t', (s: string) => s.replace(`t=${NOW_S}`, `t=-${NOW_S}`)],
    ['truncated v1', (s: string) => s.slice(0, -10)],
    ['extra hex', (s: string) => `${s}00`],
    ['leading junk', (s: string) => `x${s}`],
    ['non-hex v1', (s: string) => s.replace('v1=', 'v1=zz')],
    ['a second t', (s: string) => `${s},t=${NOW_S}`],
    ['a part without =', (s: string) => `${s},junk`],
    ['only wrong v1 values', (s: string) => `${s.replace(/v1=.*$/, `v1=${'0'.repeat(64)}`)},v1=${'1'.repeat(64)}`],
    ['a non-hex v1 beside a valid one', (s: string) => `${s},v1=not-hex`],
  ])('rejects a malformed header (%s)', async (_, mutate) => {
    expect(await zaapiAdapter.verifyWebhook(webhook(body, mutate(sign(body))))).toEqual({ valid: false, rawPayload: body })
  })

  it.each([
    ['space after comma', (s: string) => s.replace(',', ', ')],
    ['reversed order', (s: string) => `${s.split(',')[1]},${s.split(',')[0]}`],
    ['uppercase hex', (s: string) => s.replace(/v1=(.*)$/, (_, h: string) => `v1=${h.toUpperCase()}`)],
    ['an unknown extra key', (s: string) => `${s},v0=abc`],
    ['a rotated second v1', (s: string) => s.replace('v1=', `v1=${'0'.repeat(64)},v1=`)],
  ])('accepts a header variant (%s)', async (_, mutate) => {
    expect(await zaapiAdapter.verifyWebhook(webhook(body, mutate(sign(body))))).toEqual({ valid: true, rawPayload: body })
  })

  it('rejects a missing header', async () => {
    expect(await zaapiAdapter.verifyWebhook(webhook(body))).toEqual({ valid: false, rawPayload: body })
  })

  it('returns valid:false without throwing when the secret is missing', async () => {
    vi.stubEnv('ZAAPI_WEBHOOK_SECRET', '')
    // An attacker who knows the secret is unset could sign with an empty key.
    expect(await zaapiAdapter.verifyWebhook(webhook(body, sign(body, NOW_S, '')))).toEqual({ valid: false, rawPayload: body })
  })
})

describe('zaapiAdapter.parseWebhook', () => {
  beforeEach(() => vi.stubEnv('ZAAPI_API_KEY', API_KEY))

  it('maps an inbound message with channel and sender name from the conversation lookup', async () => {
    const fetchMock = lookupResponse(conversation)
    vi.stubGlobal('fetch', fetchMock)
    expect(await zaapiAdapter.parseWebhook(event(inboundMessage))).toEqual([
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
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://openplatform.zaapi.co/v1/conversations?conversationId=conv-001')
    expect(init.headers['x-api-key']).toBe(API_KEY)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('takes the conversation id from data.message, not the envelope', async () => {
    vi.stubGlobal('fetch', lookupResponse(conversation))
    const raw = JSON.stringify({ ...JSON.parse(event(inboundMessage)), data: { accountId: 'acct-001', message: inboundMessage } })
    expect((await zaapiAdapter.parseWebhook(raw))[0].externalConversationId).toBe('conv-001')
  })

  it('URL-encodes the conversation id in the lookup', async () => {
    const fetchMock = lookupResponse({ ...conversation, id: 'conv/a&b' })
    vi.stubGlobal('fetch', fetchMock)
    await zaapiAdapter.parseWebhook(event({ ...inboundMessage, conversationId: 'conv/a&b' }))
    expect(fetchMock.mock.calls[0][0]).toBe('https://openplatform.zaapi.co/v1/conversations?conversationId=conv%2Fa%26b')
  })

  it('sets senderName to null for an outbound message', async () => {
    vi.stubGlobal('fetch', lookupResponse({ ...conversation, channel: 'line' }))
    const [m] = await zaapiAdapter.parseWebhook(event({ ...inboundMessage, messageDirection: 'outbound' }, 'message.sent'))
    expect(m).toMatchObject({ direction: 'outbound', channel: 'line', senderName: null })
  })

  it('flags images as an attachment and fetches only the conversation lookup', async () => {
    const fetchMock = lookupResponse(conversation)
    vi.stubGlobal('fetch', fetchMock)
    const images = ['https://cdn.example.invalid/synthetic.png']
    const [m] = await zaapiAdapter.parseWebhook(event({ ...inboundMessage, text: undefined, images }))
    expect(m).toMatchObject({ hasAttachment: true, body: null })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/conversations?')
  })

  it('treats an empty images array as no attachment', async () => {
    vi.stubGlobal('fetch', lookupResponse(conversation))
    const [m] = await zaapiAdapter.parseWebhook(event({ ...inboundMessage, images: [] }))
    expect(m.hasAttachment).toBe(false)
  })

  it('accepts lookup data as an array and picks the record whose id matches', async () => {
    vi.stubGlobal('fetch', lookupResponse([{ id: 'conv-other', channel: 'shopee', displayName: 'Other' }, conversation]))
    const [m] = await zaapiAdapter.parseWebhook(event(inboundMessage))
    expect(m).toMatchObject({ channel: 'whatsapp', senderName: 'Test Customer' })
  })

  it('falls back to a lone lookup record when no id matches', async () => {
    vi.stubGlobal('fetch', lookupResponse([{ channel: 'tiktok', displayName: 'First' }]))
    const [m] = await zaapiAdapter.parseWebhook(event(inboundMessage))
    expect(m).toMatchObject({ channel: 'tiktok', senderName: 'First' })
  })

  it('rejects several lookup records when none matches the id', async () => {
    vi.stubGlobal('fetch', lookupResponse([{ id: 'x', channel: 'tiktok', displayName: 'A' }, { id: 'y', channel: 'line', displayName: 'B' }]))
    await expect(zaapiAdapter.parseWebhook(event(inboundMessage))).rejects.toBeInstanceOf(ZaapiLookupError)
  })

  it.each(['event', 'internal-comment'])('returns [] without fetching for messageCategory %s', async (messageCategory) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await zaapiAdapter.parseWebhook(event({ ...inboundMessage, messageCategory }))).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns [] without fetching for events that are not message events', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await zaapiAdapter.parseWebhook(event(inboundMessage, 'conversation.closed'))).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid JSON', '{not json'],
    ['an array', '[]'],
    ['null', 'null'],
    ['no data', JSON.stringify({ eventType: 'message.received' })],
    ['no data.message', JSON.stringify({ eventType: 'message.received', data: {} })],
    ['a non-object message', event('hello')],
    ['a missing id', event({ ...inboundMessage, id: undefined })],
    ['an empty id', event({ ...inboundMessage, id: '' })],
    [
      'a conversationId missing from message and envelope',
      JSON.stringify({ eventType: 'message.received', data: { message: { ...inboundMessage, conversationId: undefined } } }),
    ],
    ['a lone-surrogate conversationId', event({ ...inboundMessage, conversationId: '\uD800' })],
    ['a missing messageDirection', event({ ...inboundMessage, messageDirection: undefined })],
    ['a bad messageDirection', event({ ...inboundMessage, messageDirection: 'sideways' })],
    ['a missing sentAt', event({ ...inboundMessage, sentAt: undefined })],
    ['an invalid sentAt', event({ ...inboundMessage, sentAt: 'not a date' })],
  ])('throws ZaapiPayloadError without fetching for %s', async (_, raw) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(zaapiAdapter.parseWebhook(raw)).rejects.toBeInstanceOf(ZaapiPayloadError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['HTTP 404', () => lookupResponse({}, 404)],
    ['HTTP 500', () => lookupResponse({}, 500)],
    ['a network error', () => vi.fn().mockRejectedValue(new TypeError('fetch failed'))],
    ['a timeout', () => vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'))],
    ['a non-JSON body', () => vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }))],
    ['no records', () => lookupResponse([])],
    ['a missing channel', () => lookupResponse({ id: 'conv-001', displayName: 'Test Customer' })],
    ['an unknown channel', () => lookupResponse({ ...conversation, channel: 'carrier-pigeon' })],
    ['drunken_lullabies', () => lookupResponse({ ...conversation, channel: 'drunken_lullabies' })],
    ['a prototype key channel', () => lookupResponse({ ...conversation, channel: 'toString' })],
  ])('throws ZaapiLookupError for %s', async (_, makeFetch) => {
    vi.stubGlobal('fetch', makeFetch())
    const err = await zaapiAdapter.parseWebhook(event(inboundMessage)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ZaapiLookupError)
    expect((err as Error).message).not.toContain('Test Customer')
    expect((err as Error).message).not.toContain('synthetic order')
  })

  it('throws ZaapiLookupError without fetching when the API key is missing', async () => {
    vi.stubEnv('ZAAPI_API_KEY', '')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(zaapiAdapter.parseWebhook(event(inboundMessage))).rejects.toBeInstanceOf(ZaapiLookupError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('zaapiAdapter.parseWebhook variants', () => {
  beforeEach(() => vi.stubEnv('ZAAPI_API_KEY', API_KEY))
  const base = { ...inboundMessage, messageCategory: undefined, messageType: undefined }

  it.each([
    ['a numeric id', { id: 1001 }, { externalId: '1001' }],
    ['snake_case fields', { id: undefined, message_id: 'm-9', sent_at: '2026-11-20T09:15:00Z', sentAt: undefined }, { externalId: 'm-9' }],
    ['messageId', { id: undefined, messageId: 'm-8' }, { externalId: 'm-8' }],
    ['conversation.id', { conversationId: undefined, conversation: { id: 'conv-001' } }, { externalConversationId: 'conv-001' }],
    ['seconds timestamp', { sentAt: undefined, timestamp: 1795000000 }, { sentAt: new Date(1795000000000) }],
    ['ms timestamp', { sentAt: 1795000000123 }, { sentAt: new Date(1795000000123) }],
    ['numeric-string timestamp', { sentAt: '1795000000' }, { sentAt: new Date(1795000000000) }],
    ['ISO date createdAt', { sentAt: undefined, createdAt: '2026-11-20' }, { sentAt: new Date('2026-11-20') }],
    ['direction incoming', { messageDirection: undefined, direction: 'incoming' }, { direction: 'inbound' }],
    ['direction OUTGOING', { messageDirection: 'OUTGOING' }, { direction: 'outbound', senderName: null }],
    ['traffic received', { messageDirection: undefined, traffic: 'received' }, { direction: 'inbound' }],
    ['body instead of text', { text: undefined, body: 'Synthetic body' }, { body: 'Synthetic body' }],
    ['content.text', { text: undefined, content: { text: 'Synthetic nested' } }, { body: 'Synthetic nested' }],
    ['a non-string text', { text: { rich: true } }, { body: null }],
    ['an attachments array', { attachments: [{ type: 'file' }] }, { hasAttachment: true }],
    ['messageType sticker', { messageType: 'Sticker' }, { hasAttachment: true }],
    ['messageType text', { messageType: 'text', media: [] }, { hasAttachment: false }],
    ['missing messageCategory', {}, { externalId: 'msg-001' }],
    ['messageCategory message', { messageCategory: 'message' }, { externalId: 'msg-001' }],
  ])('accepts %s', async (_, overrides, expected) => {
    vi.stubGlobal('fetch', lookupResponse(conversation))
    const [m] = await zaapiAdapter.parseWebhook(event({ ...base, ...overrides }))
    expect(m).toMatchObject(expected)
  })

  it.each(['message.created', 'MESSAGE_RECEIVED', 'message_outgoing'])('treats event type %s as a message event', async (eventType) => {
    vi.stubGlobal('fetch', lookupResponse(conversation))
    expect(await zaapiAdapter.parseWebhook(event(base, eventType))).toHaveLength(1)
  })

  it('falls back to the envelope conversationId', async () => {
    vi.stubGlobal('fetch', lookupResponse(conversation))
    const [m] = await zaapiAdapter.parseWebhook(event({ ...base, conversationId: undefined }))
    expect(m.externalConversationId).toBe('conv-001')
  })

  it.each(['system', 'Note', 'internal_comment', 'comment'])('returns [] without fetching for messageCategory %s', async (messageCategory) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await zaapiAdapter.parseWebhook(event({ ...base, messageCategory }))).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['WhatsApp', 'whatsapp'],
    ['whatsapp-business', 'whatsapp'],
    ['facebook_messenger', 'facebook'],
    ['IG', 'instagram'],
    ['LINE', 'line'],
    ['Lazada Chat', 'lazada'],
  ])('maps lookup channel %s to %s', async (spelling, channel) => {
    vi.stubGlobal('fetch', lookupResponse({ ...conversation, channel: spelling }))
    expect((await zaapiAdapter.parseWebhook(event(base)))[0].channel).toBe(channel)
  })

  it.each([
    ['data.items', { items: [conversation] }, {}],
    ['data.conversations', { conversations: [conversation] }, {}],
    ['data.data with a numeric id', { data: [{ id: 6 }, { ...conversation, id: 7 }] }, { conversationId: 7 }],
    ['platform and name fields', { id: 'conv-001', platform: 'whatsapp', name: 'Test Customer' }, {}],
  ])('reads lookup records under %s', async (_, data, overrides) => {
    vi.stubGlobal('fetch', lookupResponse(data))
    const [m] = await zaapiAdapter.parseWebhook(event({ ...base, ...overrides }))
    expect(m).toMatchObject({ channel: 'whatsapp', senderName: 'Test Customer' })
  })

  it('throws ZaapiLookupError with field channel for online_store', async () => {
    vi.stubGlobal('fetch', lookupResponse({ ...conversation, channel: 'online_store' }))
    const err = await zaapiAdapter.parseWebhook(event(base)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ZaapiLookupError)
    expect((err as ZaapiLookupError).field).toBe('channel')
  })

  it.each([
    ['sentAt', { sentAt: 'not a date' }],
    ['sentAt', { sentAt: -5 }],
    ['sentAt', { sentAt: undefined }],
    ['id', { id: -1 }],
    ['id', { id: '   ' }],
    ['direction', { messageDirection: 'sideways' }],
  ])('names the broken field %s in ZaapiPayloadError', async (field, overrides) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const err = await zaapiAdapter.parseWebhook(event({ ...base, ...overrides })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ZaapiPayloadError)
    expect(err).toBeInstanceOf(AdapterPayloadError)
    expect((err as ZaapiPayloadError).field).toBe(field)
    expect((err as Error).message).not.toContain('synthetic order')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('zaapiAdapter.sendReply', () => {
  const reply = { conversationId: 'internal-1', externalConversationId: 'conv-001', body: 'Synthetic reply' }
  const respond = (status: number, json: unknown = {}) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status }))

  beforeEach(() => vi.stubEnv('ZAAPI_API_KEY', API_KEY))

  it('returns sent with a null message id on 201 and sends the key as x-api-key', async () => {
    const fetchMock = respond(201, { requestId: 'req-1', data: { message: 'OK' } })
    vi.stubGlobal('fetch', fetchMock)
    expect(await zaapiAdapter.sendReply(reply)).toEqual({ status: 'sent', externalMessageId: null })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://openplatform.zaapi.co/v1/messages/plain-text')
    expect(init.method).toBe('POST')
    expect(init.headers['x-api-key']).toBe(API_KEY)
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(init.body)).toEqual({ conversationId: 'conv-001', text: 'Synthetic reply' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('treats any 2xx as sent', async () => {
    vi.stubGlobal('fetch', respond(200))
    expect(await zaapiAdapter.sendReply(reply)).toEqual({ status: 'sent', externalMessageId: null })
  })

  it.each([
    [400, 'failed'],
    [401, 'failed'],
    [404, 'failed'],
    [500, 'unconfirmed'],
    [503, 'unconfirmed'],
  ])('maps HTTP %i to %s without leaking the body or key', async (status, outcome) => {
    vi.stubGlobal('fetch', respond(status, { error: { message: 'echoed Synthetic reply', statusCode: status } }))
    expect(await zaapiAdapter.sendReply(reply)).toEqual({ status: outcome, errorMessage: `Zaapi returned HTTP ${status}` })
  })

  it('returns unconfirmed when fetch rejects or times out, since Zaapi may have sent it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    expect(await zaapiAdapter.sendReply(reply)).toEqual({ status: 'unconfirmed', errorMessage: 'Zaapi request failed' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')))
    expect(await zaapiAdapter.sendReply(reply)).toEqual({ status: 'unconfirmed', errorMessage: 'Zaapi request timed out' })
  })

  it('returns failed without calling fetch when the API key is missing', async () => {
    vi.stubEnv('ZAAPI_API_KEY', '')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await zaapiAdapter.sendReply(reply)).status).toBe('failed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', ''],
    ['1001 chars', 'x'.repeat(1001)],
  ])('returns failed without calling fetch for %s text', async (_, body) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await zaapiAdapter.sendReply({ ...reply, body })).status).toBe('failed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends text of exactly 1000 chars', async () => {
    vi.stubGlobal('fetch', respond(201))
    expect((await zaapiAdapter.sendReply({ ...reply, body: 'x'.repeat(1000) })).status).toBe('sent')
  })

  it.each(['', '\uD800'])('returns failed without throwing for conversation id %j', async (id) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await zaapiAdapter.sendReply({ ...reply, externalConversationId: id })).status).toBe('failed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
