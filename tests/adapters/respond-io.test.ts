import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdapterPayloadError } from '@/lib/adapters/lenient'
import { RESPOND_IO_SIGNATURE_HEADER, RespondIoPayloadError, respondIoAdapter } from '@/lib/adapters/respond-io'

const SECRET = 'synthetic-signing-key'
const API_KEY = 'synthetic-api-token'
const sign = (body: string | Buffer, secret = SECRET) => createHmac('sha256', secret).update(body).digest('base64')
const webhook = (body: string | Buffer, signature?: string) =>
  new Request('http://127.0.0.1/api/webhooks/respond-io', {
    method: 'POST',
    body: typeof body === 'string' ? body : new Uint8Array(body),
    headers: signature === undefined ? {} : { [RESPOND_IO_SIGNATURE_HEADER]: signature },
  })

// Shapes follow the respond.io docs examples; all values are synthetic.
const incoming = {
  messageId: 1726740558441000,
  channelMessageId: 123,
  contactId: 42,
  channelId: 7,
  traffic: 'incoming',
  timestamp: 1795000000000,
  message: { type: 'text', text: 'Where is my synthetic order?' },
}
const contact = { id: 42, firstName: 'Test', lastName: 'Customer', phone: '+60100000000' }
const event = (message: unknown, eventType = 'message.received', extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    event_type: eventType,
    event_id: '00000000-0000-4000-8000-000000000001',
    contact,
    message,
    channel: { id: 7, name: 'Synthetic WA', source: 'whatsapp_cloud', meta: '{}', created_at: 1701403960 },
    ...extra,
  })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('respondIoAdapter.verifyWebhook', () => {
  const body = event(incoming)
  beforeEach(() => vi.stubEnv('RESPOND_IO_WEBHOOK_SECRET', SECRET))

  it('accepts a base64 HMAC over the raw body and returns the raw payload', async () => {
    expect(await respondIoAdapter.verifyWebhook(webhook(body, sign(body)))).toEqual({ valid: true, rawPayload: body })
  })

  it('accepts a signature over the re-stringified JSON (the docs Node example)', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2)
    expect((await respondIoAdapter.verifyWebhook(webhook(pretty, sign(body)))).valid).toBe(true)
  })

  it('verifies over the received bytes, not a re-encoded string', async () => {
    const bytes = Buffer.concat([Buffer.from('{"x":"'), Buffer.from([0xff]), Buffer.from('"}')])
    expect((await respondIoAdapter.verifyWebhook(webhook(bytes, sign(bytes)))).valid).toBe(true)
  })

  it('rejects a tampered body', async () => {
    const tampered = body.replace('synthetic order', 'tampered order')
    expect(await respondIoAdapter.verifyWebhook(webhook(tampered, sign(body)))).toEqual({ valid: false, rawPayload: tampered })
  })

  it('rejects a signature made with another key', async () => {
    expect((await respondIoAdapter.verifyWebhook(webhook(body, sign(body, 'other-key')))).valid).toBe(false)
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['truncated', sign(body).slice(0, -4)],
    ['non-base64 chars', `${sign(body)}!`],
    ['truncated hex', createHmac('sha256', SECRET).update(body).digest('hex').slice(0, -2)],
    ['hex signed with another key', createHmac('sha256', 'other-key').update(body).digest('hex')],
    ['an unknown prefix', `sha1=${sign(body)}`],
  ])('rejects a %s header', async (_, signature) => {
    expect(await respondIoAdapter.verifyWebhook(webhook(body, signature))).toEqual({ valid: false, rawPayload: body })
  })

  it.each([
    ['lowercase hex', createHmac('sha256', SECRET).update(body).digest('hex')],
    ['uppercase hex', createHmac('sha256', SECRET).update(body).digest('hex').toUpperCase()],
    ['sha256= base64', `sha256=${sign(body)}`],
    ['sha256= hex', `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`],
  ])('accepts a %s header', async (_, signature) => {
    expect(await respondIoAdapter.verifyWebhook(webhook(body, signature))).toEqual({ valid: true, rawPayload: body })
  })

  it('accepts a hex signature over the re-stringified JSON', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2)
    const hex = createHmac('sha256', SECRET).update(body).digest('hex')
    expect((await respondIoAdapter.verifyWebhook(webhook(pretty, hex))).valid).toBe(true)
  })

  it('rejects a non-JSON body whose raw signature does not match', async () => {
    expect((await respondIoAdapter.verifyWebhook(webhook('{not json', sign('other')))).valid).toBe(false)
  })

  it('returns valid:false when the secret is missing, even for an empty-key signature', async () => {
    vi.stubEnv('RESPOND_IO_WEBHOOK_SECRET', '')
    expect((await respondIoAdapter.verifyWebhook(webhook(body, sign(body, '')))).valid).toBe(false)
  })
})

describe('respondIoAdapter.parseWebhook', () => {
  it('maps an incoming text message to IncomingMessage with platform respond_io', async () => {
    expect(await respondIoAdapter.parseWebhook(event(incoming))).toEqual([
      {
        externalId: '1726740558441000',
        externalConversationId: '42',
        platform: 'respond_io',
        channel: 'whatsapp',
        direction: 'inbound',
        senderName: 'Test Customer',
        body: 'Where is my synthetic order?',
        hasAttachment: false,
        sentAt: new Date(1795000000000),
      },
    ])
  })

  it('never calls fetch, including for attachment URLs', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const attachment = { type: 'attachment', attachment: { type: 'image', url: 'https://cdn.example.invalid/x.jpg' } }
    const [m] = await respondIoAdapter.parseWebhook(event({ ...incoming, message: attachment }))
    expect(m).toMatchObject({ hasAttachment: true, body: null })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reads a 10-digit timestamp as seconds', async () => {
    const [m] = await respondIoAdapter.parseWebhook(event({ ...incoming, timestamp: 1795000000 }))
    expect(m.sentAt).toEqual(new Date(1795000000000))
  })

  it('maps an outgoing message with a null sender name', async () => {
    const [m] = await respondIoAdapter.parseWebhook(event({ ...incoming, traffic: 'outgoing' }, 'message.sent'))
    expect(m).toMatchObject({ direction: 'outbound', senderName: null })
  })

  it('falls back to contact.id when message.contactId is missing', async () => {
    const [m] = await respondIoAdapter.parseWebhook(event({ ...incoming, contactId: undefined }))
    expect(m.externalConversationId).toBe('42')
  })

  it('uses null sender name when the contact has no name', async () => {
    const raw = event(incoming, 'message.received', { contact: { id: 42, firstName: '', lastName: null } })
    expect((await respondIoAdapter.parseWebhook(raw))[0].senderName).toBeNull()
  })

  it.each([
    ['facebook', 'facebook'],
    ['instagram', 'instagram'],
    ['line', 'line'],
    ['360dialog_whatsapp', 'whatsapp'],
    ['whatsapp_business', 'whatsapp'],
  ])('maps channel source %s to %s', async (source, channel) => {
    const raw = event(incoming, 'message.received', { channel: { id: 7, source } })
    expect((await respondIoAdapter.parseWebhook(raw))[0].channel).toBe(channel)
  })

  it('returns [] for events that are not message events', async () => {
    expect(await respondIoAdapter.parseWebhook(event(incoming, 'contact.updated'))).toEqual([])
  })

  it.each([
    ['invalid JSON', '{not json'],
    ['an array', '[]'],
    ['no message', JSON.stringify({ event_type: 'message.received' })],
    ['a missing messageId', event({ ...incoming, messageId: undefined })],
    ['a fractional messageId', event({ ...incoming, messageId: 1.5 })],
    ['no contact id anywhere', event({ ...incoming, contactId: undefined }, 'message.received', { contact: {} })],
    ['a bad traffic value', event({ ...incoming, traffic: 'sideways' })],
    ['a missing timestamp', event({ ...incoming, timestamp: undefined })],
    ['a non-date string timestamp', event({ ...incoming, timestamp: 'yesterday' })],
    ['a telegram channel', event(incoming, 'message.received', { channel: { id: 7, source: 'telegram' } })],
    ['a prototype-key channel', event(incoming, 'message.received', { channel: { id: 7, source: 'toString' } })],
    ['no channel', event(incoming, 'message.received', { channel: undefined })],
  ])('throws RespondIoPayloadError for %s without leaking content', async (_, raw) => {
    const err = await respondIoAdapter.parseWebhook(raw).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RespondIoPayloadError)
    expect((err as Error).message).not.toContain('synthetic order')
    expect((err as Error).message).not.toContain('Test Customer')
  })
})

describe('respondIoAdapter.parseWebhook variants', () => {
  it.each([
    ['string ids', { messageId: '1726740558441000', contactId: '42' }, {}, { externalId: '1726740558441000', externalConversationId: '42' }],
    ['message.id', { messageId: undefined, id: 555 }, {}, { externalId: '555' }],
    ['snake_case fields', { messageId: undefined, message_id: 9, contactId: undefined, contact_id: 43 }, {}, { externalId: '9', externalConversationId: '43' }],
    ['an ISO timestamp', { timestamp: '2026-11-20T09:15:00Z' }, {}, { sentAt: new Date('2026-11-20T09:15:00Z') }],
    ['a numeric-string ms timestamp', { timestamp: '1795000000000' }, {}, { sentAt: new Date(1795000000000) }],
    ['created_at seconds', { timestamp: undefined, created_at: 1795000000 }, {}, { sentAt: new Date(1795000000000) }],
    ['direction inbound', { traffic: undefined, direction: 'inbound' }, {}, { direction: 'inbound' }],
    ['traffic OUTGOING', { traffic: 'OUTGOING' }, {}, { direction: 'outbound', senderName: null }],
    ['message.text', { message: undefined, text: 'Synthetic flat text' }, {}, { body: 'Synthetic flat text' }],
    ['an image type', { message: { type: 'image', url: 'https://cdn.example.invalid/x.jpg' } }, {}, { hasAttachment: true, body: null }],
    ['an attachments array', { message: { type: 'text', text: 'hi', attachments: [{}] } }, {}, { hasAttachment: true }],
    ['contact.name', {}, { contact: { id: 42, name: 'Synthetic Name' } }, { senderName: 'Synthetic Name' }],
    ['snake_case contact names', {}, { contact: { id: 42, first_name: 'Synth', last_name: 'Etic' } }, { senderName: 'Synth Etic' }],
    ['channel.type', {}, { channel: { id: 7, type: 'instagram' } }, { channel: 'instagram' }],
    ['event_type with underscores', {}, { event_type: 'MESSAGE_RECEIVED' }, { externalId: '1726740558441000' }],
  ])('accepts %s', async (_, messageOverrides, envelopeOverrides, expected) => {
    const [m] = await respondIoAdapter.parseWebhook(event({ ...incoming, ...messageOverrides }, 'message.received', envelopeOverrides))
    expect(m).toMatchObject(expected)
  })

  it.each([
    ['WhatsApp', 'whatsapp'],
    ['whatsapp-business', 'whatsapp'],
    ['twilio_whatsapp', 'whatsapp'],
    ['message_bird_whatsapp', 'whatsapp'],
    ['facebook_messenger', 'facebook'],
    ['IG', 'instagram'],
    ['LINE', 'line'],
  ])('maps channel source %s to %s', async (source, channel) => {
    const raw = event(incoming, 'message.received', { channel: { id: 7, source } })
    expect((await respondIoAdapter.parseWebhook(raw))[0].channel).toBe(channel)
  })

  it.each([
    ['channel', { channel: { id: 7, source: 'online_store' } }, {}],
    ['channel', { channel: { id: 7, source: 'telegram' } }, {}],
    ['sentAt', {}, { timestamp: 0 }],
    ['sentAt', {}, { timestamp: 'yesterday' }],
    ['id', {}, { messageId: 1.5 }],
    ['conversationId', { contact: {} }, { contactId: undefined }],
    ['direction', {}, { traffic: 'sideways' }],
    ['message', { message: 'not an object' }, {}],
  ])('names the broken field %s in RespondIoPayloadError', async (field, envelopeOverrides, messageOverrides) => {
    const raw = event({ ...incoming, ...messageOverrides }, 'message.received', envelopeOverrides)
    const err = await respondIoAdapter.parseWebhook(raw).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RespondIoPayloadError)
    expect(err).toBeInstanceOf(AdapterPayloadError)
    expect((err as RespondIoPayloadError).field).toBe(field)
    expect((err as Error).message).not.toContain('synthetic order')
  })
})

describe('respondIoAdapter.sendReply', () => {
  const reply = { conversationId: 'internal-1', externalConversationId: '42', body: 'Synthetic reply' }
  const respond = (status: number, json: unknown = {}) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status }))

  beforeEach(() => vi.stubEnv('RESPOND_IO_API_KEY', API_KEY))

  it('posts a text message to the contact with a Bearer token and returns the message id', async () => {
    const fetchMock = respond(200, { messageId: 987654321 })
    vi.stubGlobal('fetch', fetchMock)
    expect(await respondIoAdapter.sendReply(reply)).toEqual({ status: 'sent', externalMessageId: '987654321' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.respond.io/v2/contact/id:42/message')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`)
    expect(JSON.parse(init.body)).toEqual({ message: { type: 'text', text: 'Synthetic reply' } })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    ['a string messageId', { messageId: 'abc-1' }, 'abc-1'],
    ['data.messageId', { data: { messageId: 11 } }, '11'],
    ['data.id', { data: { id: 12 } }, '12'],
  ])('reads the sent message id from %s', async (_, json, id) => {
    vi.stubGlobal('fetch', respond(200, json))
    expect(await respondIoAdapter.sendReply(reply)).toEqual({ status: 'sent', externalMessageId: id })
  })

  it('returns sent with a null id when the 2xx body has no messageId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    expect(await respondIoAdapter.sendReply(reply)).toEqual({ status: 'sent', externalMessageId: null })
  })

  it.each([400, 401, 404, 429, 449, 500])('returns failed on HTTP %i without leaking the body', async (status) => {
    vi.stubGlobal('fetch', respond(status, { code: status, message: 'echoed Synthetic reply' }))
    expect(await respondIoAdapter.sendReply(reply)).toEqual({ status: 'failed', errorMessage: `respond.io returned HTTP ${status}` })
  })

  it('returns failed when fetch rejects or times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    expect(await respondIoAdapter.sendReply(reply)).toEqual({ status: 'failed', errorMessage: 'respond.io request failed' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')))
    expect(await respondIoAdapter.sendReply(reply)).toEqual({ status: 'failed', errorMessage: 'respond.io request timed out' })
  })

  it.each([
    ['a missing API key', { env: '' }, reply],
    ['empty text', {}, { ...reply, body: '   ' }],
    ['a non-numeric contact id', {}, { ...reply, externalConversationId: '42/../x' }],
    ['an empty contact id', {}, { ...reply, externalConversationId: '' }],
  ])('returns failed without calling fetch for %s', async (_, opts: { env?: string }, r) => {
    if (opts.env !== undefined) vi.stubEnv('RESPOND_IO_API_KEY', opts.env)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await respondIoAdapter.sendReply(r)).status).toBe('failed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
