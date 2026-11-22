import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Channel, IncomingMessage, PlatformAdapter, SendResult } from './types'

// Formats follow https://docs.zaapi.com/webhooks
export const ZAAPI_SIGNATURE_HEADER = 'x-zaapi-signature'
export const ZAAPI_API_BASE_URL = 'https://openplatform.zaapi.co/v1'
export const ZAAPI_MESSAGE_EVENTS = ['message.received', 'message.sent']
const SIGNATURE_TOLERANCE_S = 300
// Zaapi expects the webhook 2xx within 10 s.
const LOOKUP_TIMEOUT_MS = 5_000
const SEND_TIMEOUT_MS = 30_000
const MAX_TEXT_LENGTH = 1000

// shortcut: unmapped Zaapi channels (drunken_lullabies + 3 undocumented) are rejected, extend the map once confirmed
const ZAAPI_CHANNELS: Record<string, Channel> = {
  line: 'line',
  instagram: 'instagram',
  facebook: 'facebook',
  lazada: 'lazada',
  shopee: 'shopee',
  tiktok: 'tiktok',
  whatsapp: 'whatsapp',
}

// Thrown when the envelope itself is unusable. The message never includes payload content.
export class ZaapiPayloadError extends Error {
  name = 'ZaapiPayloadError'
}

// Thrown when the conversation lookup fails; the route answers 503 so Zaapi retries.
// The message never includes payload content.
export class ZaapiLookupError extends Error {
  name = 'ZaapiLookupError'
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.isWellFormed()

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
  // The docs don't say whether data is one record or an array for this filter.
  const data = isObject(body) ? body.data : undefined
  const records = (Array.isArray(data) ? data : [data]).filter(isObject)
  // Fall back only to a lone record: picking from several could attach another customer's name.
  const record = records.find((r) => r.id === conversationId) ?? (records.length === 1 ? records[0] : undefined)
  const zaapiChannel = record?.channel
  if (typeof zaapiChannel !== 'string' || !Object.hasOwn(ZAAPI_CHANNELS, zaapiChannel)) {
    throw new ZaapiLookupError('Zaapi conversation has a missing or unmapped channel')
  }
  return {
    channel: ZAAPI_CHANNELS[zaapiChannel],
    displayName: typeof record?.displayName === 'string' ? record.displayName : null,
  }
}

export const zaapiAdapter: PlatformAdapter = {
  async verifyWebhook(req) {
    const bytes = Buffer.from(await req.arrayBuffer())
    const rawPayload = new TextDecoder().decode(bytes)
    const secret = process.env.ZAAPI_WEBHOOK_SECRET
    const match = /^t=(\d+),v1=([0-9a-f]+)$/.exec(req.headers.get(ZAAPI_SIGNATURE_HEADER) ?? '')
    if (!secret || !match) return { valid: false, rawPayload }
    const [, t, v1] = match
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > SIGNATURE_TOLERANCE_S) return { valid: false, rawPayload }
    const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.`).update(bytes).digest('hex'))
    const given = Buffer.from(v1)
    return { valid: given.length === expected.length && timingSafeEqual(given, expected), rawPayload }
  },

  // Throws ZaapiPayloadError for invalid JSON, a non-object, or a message event with a malformed
  // data.message, and ZaapiLookupError when the conversation lookup fails. Returns [] for other
  // events and for system events or internal comments.
  async parseWebhook(rawPayload) {
    let envelope: unknown
    try {
      envelope = JSON.parse(rawPayload)
    } catch {
      throw new ZaapiPayloadError('Zaapi webhook payload is not valid JSON')
    }
    if (!isObject(envelope)) throw new ZaapiPayloadError('Zaapi webhook payload is not an object')
    if (!ZAAPI_MESSAGE_EVENTS.includes(envelope.eventType as string)) return []
    const m = isObject(envelope.data) ? envelope.data.message : undefined
    if (!isObject(m)) throw new ZaapiPayloadError('Zaapi message event has no data.message object')
    if (m.messageCategory !== 'message') return []
    const { id, conversationId, messageDirection, sentAt, text, images } = m
    const sentAtDate = typeof sentAt === 'string' ? new Date(sentAt) : null
    if (
      !isId(id) ||
      !isId(conversationId) ||
      (messageDirection !== 'inbound' && messageDirection !== 'outbound') ||
      !sentAtDate ||
      Number.isNaN(sentAtDate.getTime())
    ) {
      throw new ZaapiPayloadError('Zaapi message is missing a required field')
    }
    // Message events carry no channel or sender name, so fetch them only after the payload validates.
    const { channel, displayName } = await lookupConversation(conversationId)
    return [
      {
        externalId: id,
        externalConversationId: conversationId,
        platform: 'zaapi',
        channel,
        direction: messageDirection,
        senderName: messageDirection === 'inbound' ? displayName : null,
        body: typeof text === 'string' ? text : null,
        hasAttachment: Array.isArray(images) && images.length > 0,
        sentAt: sentAtDate,
      },
    ]
  },

  // The caller must not auto-retry a failure: Zaapi has no idempotency key, so a retry can double-send.
  async sendReply(reply): Promise<SendResult> {
    const apiKey = process.env.ZAAPI_API_KEY
    if (!apiKey) return { status: 'failed', errorMessage: 'ZAAPI_API_KEY is not set' }
    const convId = reply.externalConversationId
    if (!isId(convId)) return { status: 'failed', errorMessage: 'Invalid conversation id' }
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
      if (!res.ok) return { status: 'failed', errorMessage: `Zaapi returned HTTP ${res.status}` }
      return { status: 'sent', externalMessageId: null }
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      return { status: 'failed', errorMessage: timedOut ? 'Zaapi request timed out' : 'Zaapi request failed' }
    }
  },
}
