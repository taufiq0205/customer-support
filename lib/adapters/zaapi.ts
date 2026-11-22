import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  AdapterPayloadError,
  hasAny,
  normalizeEventType,
  parseObject,
  pick,
  required,
  toChannel,
  toDate,
  toDirection,
  toId,
} from './lenient'
import type { Channel, PlatformAdapter, SendResult } from './types'

// Formats follow https://docs.zaapi.com/webhooks
export const ZAAPI_SIGNATURE_HEADER = 'x-zaapi-signature'
export const ZAAPI_API_BASE_URL = 'https://openplatform.zaapi.co/v1'
export const ZAAPI_MESSAGE_EVENTS = ['message.received', 'message.sent', 'message.created', 'message.incoming', 'message.outgoing']
const SIGNATURE_TOLERANCE_S = 300
// Zaapi expects the webhook 2xx within 10 s.
const LOOKUP_TIMEOUT_MS = 5_000
const SEND_TIMEOUT_MS = 30_000
const MAX_TEXT_LENGTH = 1000

// Every field is read through these paths, first match wins. Webhook paths are rooted at the envelope.
const ZAAPI_FIELDS = {
  webhook: {
    eventType: ['eventType', 'event_type', 'event'],
    message: ['data.message'],
    category: ['data.message.messageCategory', 'data.message.message_category'],
    id: ['data.message.id', 'data.message.messageId', 'data.message.message_id'],
    conversationId: [
      'data.message.conversationId',
      'data.message.conversation_id',
      'data.message.conversation.id',
      'data.conversationId',
      'data.conversation_id',
    ],
    direction: ['data.message.messageDirection', 'data.message.direction', 'data.message.traffic'],
    sentAt: [
      'data.message.sentAt',
      'data.message.sent_at',
      'data.message.createdAt',
      'data.message.created_at',
      'data.message.timestamp',
    ],
    text: ['data.message.text', 'data.message.body', 'data.message.content.text'],
    messageType: ['data.message.messageType', 'data.message.message_type'],
    attachments: [
      'data.message.images',
      'data.message.attachments',
      'data.message.files',
      'data.message.media',
      'data.message.videos',
      'data.message.audios',
    ],
  },
  lookup: {
    records: ['data.conversations', 'data.items', 'data.data', 'data'],
    id: ['id', 'conversationId', 'conversation_id'],
    // shortcut: drunken_lullabies + 3 undocumented Zaapi channels match no token and are rejected, extend toChannel once confirmed
    channel: ['channel', 'channelType', 'platform', 'source'],
    displayName: ['displayName', 'name', 'customerName', 'contact.name'],
  },
} as const

// A missing category counts as a message: silently dropping every message is the worse failure.
const SKIP_CATEGORIES = ['event', 'system', 'internal-comment', 'internal_comment', 'note', 'comment']
const ATTACHMENT_TYPES = ['image', 'video', 'audio', 'file', 'document', 'sticker']

export class ZaapiPayloadError extends AdapterPayloadError {
  name = 'ZaapiPayloadError'
}

// Thrown when the conversation lookup fails; the route answers 503 so Zaapi retries.
// The message never includes payload content.
export class ZaapiLookupError extends Error {
  name = 'ZaapiLookupError'
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const lower = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : '')

// Parses `t=<unix s>,v1=<hex>[,v1=<hex>...]` in any order. Unknown keys are ignored; malformed parts reject.
function parseSignature(header: string): { t: string; v1: string[] } | null {
  let t: string | undefined
  const v1: string[] = []
  for (const part of header.split(',')) {
    const kv = /^\s*([A-Za-z0-9]+)=(\S+)\s*$/.exec(part)
    if (!kv) return null
    const key = kv[1].toLowerCase()
    if (key === 't') {
      if (t !== undefined) return null
      t = kv[2]
    } else if (key === 'v1') v1.push(kv[2])
  }
  if (!t || !/^\d+$/.test(t) || v1.length === 0 || !v1.every((h) => /^[0-9a-f]+$/i.test(h))) return null
  return { t, v1: v1.map((h) => h.toLowerCase()) }
}

async function lookupConversation(conversationId: string): Promise<{ channel: Channel; displayName: string | null }> {
  const apiKey = process.env.ZAAPI_API_KEY
  if (!apiKey) throw new ZaapiLookupError('ZAAPI_API_KEY is not set')
  let res: Response
  let body: unknown
  try {
    res = await fetch(`${ZAAPI_API_BASE_URL}/conversations?conversationId=${encodeURIComponent(conversationId)}`, {
      headers: { 'x-api-key': apiKey },
      redirect: 'error',
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
    body = res.ok ? await res.json() : null
  } catch {
    throw new ZaapiLookupError('Zaapi conversation lookup failed')
  }
  if (!res.ok) throw new ZaapiLookupError(`Zaapi conversation lookup returned HTTP ${res.status}`)
  const L = ZAAPI_FIELDS.lookup
  const found = pick(body, L.records)
  const records = (Array.isArray(found) ? found : [found]).filter(isObject)
  // Fall back only to a lone record: picking from several could attach another customer's name.
  const record =
    records.find((r) => toId(pick(r, L.id)) === conversationId) ?? (records.length === 1 ? records[0] : undefined)
  if (!record) throw new ZaapiLookupError('Zaapi lookup returned no matching conversation', 'records')
  const channel = toChannel(pick(record, L.channel))
  if (!channel) throw new ZaapiLookupError('Zaapi conversation has a missing or unmapped channel', 'channel')
  const displayName = pick(record, L.displayName)
  return { channel, displayName: typeof displayName === 'string' ? displayName : null }
}

export const zaapiAdapter: PlatformAdapter = {
  async verifyWebhook(req) {
    const bytes = Buffer.from(await req.arrayBuffer())
    const rawPayload = new TextDecoder().decode(bytes)
    const secret = process.env.ZAAPI_WEBHOOK_SECRET
    const sig = parseSignature(req.headers.get(ZAAPI_SIGNATURE_HEADER) ?? '')
    if (!secret || !sig) return { valid: false, rawPayload }
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(sig.t)) > SIGNATURE_TOLERANCE_S) return { valid: false, rawPayload }
    const expected = Buffer.from(createHmac('sha256', secret).update(`${sig.t}.`).update(bytes).digest('hex'))
    // Several v1 values allow key rotation; any one matching is enough.
    const valid = sig.v1.some((h) => {
      const given = Buffer.from(h)
      return given.length === expected.length && timingSafeEqual(given, expected)
    })
    return { valid, rawPayload }
  },

  // Throws ZaapiPayloadError (with .field) for invalid JSON, a non-object, or a message event with a
  // missing or unusable field, and ZaapiLookupError when the conversation lookup fails. Returns [] for
  // other events and for system events or internal comments.
  async parseWebhook(rawPayload) {
    const envelope = parseObject(rawPayload, ZaapiPayloadError)
    const F = ZAAPI_FIELDS.webhook
    const eventType = normalizeEventType(pick(envelope, F.eventType))
    if (!eventType || !ZAAPI_MESSAGE_EVENTS.includes(eventType)) return []
    if (!isObject(pick(envelope, F.message))) {
      throw new ZaapiPayloadError('message', 'Zaapi message event has no data.message object')
    }
    if (SKIP_CATEGORIES.includes(lower(pick(envelope, F.category)))) return []
    const need = <T>(field: keyof typeof F, coerce: (v: unknown) => T | null) =>
      required(envelope, field, F[field], coerce, ZaapiPayloadError)
    const id = need('id', toId)
    const conversationId = need('conversationId', toId)
    const direction = need('direction', toDirection)
    const sentAt = need('sentAt', toDate)
    const text = pick(envelope, F.text)
    // Message events carry no channel or sender name, so fetch them only after the payload validates.
    const { channel, displayName } = await lookupConversation(conversationId)
    return [
      {
        externalId: id,
        externalConversationId: conversationId,
        platform: 'zaapi',
        channel,
        direction,
        senderName: direction === 'inbound' ? displayName : null,
        body: typeof text === 'string' ? text : null,
        hasAttachment: hasAny(envelope, F.attachments) || ATTACHMENT_TYPES.includes(lower(pick(envelope, F.messageType))),
        sentAt,
      },
    ]
  },

  // The caller must not auto-retry an unconfirmed send: Zaapi has no idempotency key, so a retry can double-send.
  async sendReply(reply): Promise<SendResult> {
    const apiKey = process.env.ZAAPI_API_KEY
    if (!apiKey) return { status: 'failed', errorMessage: 'ZAAPI_API_KEY is not set' }
    const convId = toId(reply.externalConversationId)
    if (!convId) return { status: 'failed', errorMessage: 'Invalid conversation id' }
    if (reply.body.length < 1 || reply.body.length > MAX_TEXT_LENGTH) {
      return { status: 'failed', errorMessage: `Reply text must be 1-${MAX_TEXT_LENGTH} characters` }
    }
    try {
      const res = await fetch(`${ZAAPI_API_BASE_URL}/messages/plain-text`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId, text: reply.body }),
        redirect: 'error',
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      })
      // The error body's message may echo input, so report only the status.
      if (!res.ok) return { status: res.status >= 500 ? 'unconfirmed' : 'failed', errorMessage: `Zaapi returned HTTP ${res.status}` }
      return { status: 'sent', externalMessageId: null }
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      return { status: 'unconfirmed', errorMessage: timedOut ? 'Zaapi request timed out' : 'Zaapi request failed' }
    }
  },
}
