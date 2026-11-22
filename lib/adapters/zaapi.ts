import { createHmac, timingSafeEqual } from 'node:crypto'
import { CHANNELS, type Channel, type IncomingMessage, type PlatformAdapter, type SendResult } from './types'

// shortcut: assumed Zaapi format, confirm against Zaapi docs before go-live
// Assumed envelope:
//   { event: 'message.created', data: { messages: [{ id, conversation_id, channel,
//     direction: 'inbound' | 'outbound', sender: { name }, text, attachments: [...], created_at: ISO-8601 }] } }
// Assumed signature: lowercase hex HMAC-SHA256 of the raw body, no prefix.
// Assumed send: POST {base}/conversations/{id}/messages with { text }, 2xx response { id }.
export const ZAAPI_SIGNATURE_HEADER = 'x-zaapi-signature'
export const ZAAPI_API_BASE_URL = 'https://api.zaapi.com/v1'
export const ZAAPI_MESSAGE_EVENTS = ['message.created', 'message.updated']
const SEND_TIMEOUT_MS = 30_000

// Thrown when the envelope itself is unusable. The message never includes payload content.
export class ZaapiPayloadError extends Error {
  name = 'ZaapiPayloadError'
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

// Returns null for a message that lacks a required field. Unknown channels are skipped too:
// labelling them as another channel would corrupt channel reports.
function toIncomingMessage(m: unknown): IncomingMessage | null {
  if (!isObject(m)) return null
  const { id, conversation_id, channel, direction, sender, text, attachments, created_at } = m
  const ch = typeof channel === 'string' ? channel.toLowerCase() : ''
  if (!nonEmptyString(id) || !nonEmptyString(conversation_id)) return null
  if (!(CHANNELS as readonly string[]).includes(ch)) return null
  if (direction !== 'inbound' && direction !== 'outbound') return null
  const sentAt = typeof created_at === 'string' ? new Date(created_at) : null
  if (!sentAt || Number.isNaN(sentAt.getTime())) return null
  return {
    externalId: id,
    externalConversationId: conversation_id,
    platform: 'zaapi',
    channel: ch as Channel,
    direction,
    senderName: isObject(sender) && typeof sender.name === 'string' ? sender.name : null,
    body: typeof text === 'string' ? text : null,
    hasAttachment: Array.isArray(attachments) && attachments.length > 0,
    sentAt,
  }
}

export const zaapiAdapter: PlatformAdapter = {
  async verifyWebhook(req) {
    const rawPayload = await req.text()
    const secret = process.env.ZAAPI_WEBHOOK_SECRET
    const signature = req.headers.get(ZAAPI_SIGNATURE_HEADER)
    if (!secret || !signature) return { valid: false, rawPayload }
    const expected = Buffer.from(createHmac('sha256', secret).update(rawPayload).digest('hex'))
    const given = Buffer.from(signature.toLowerCase())
    return { valid: given.length === expected.length && timingSafeEqual(given, expected), rawPayload }
  },

  // Throws ZaapiPayloadError for invalid JSON or a message event without a messages array.
  // Skips individual messages that fail validation, and returns [] for non-message events.
  async parseWebhook(rawPayload) {
    let envelope: unknown
    try {
      envelope = JSON.parse(rawPayload)
    } catch {
      throw new ZaapiPayloadError('Zaapi webhook payload is not valid JSON')
    }
    if (!isObject(envelope)) throw new ZaapiPayloadError('Zaapi webhook payload is not an object')
    if (!ZAAPI_MESSAGE_EVENTS.includes(envelope.event as string)) return []
    const messages = isObject(envelope.data) ? envelope.data.messages : undefined
    if (!Array.isArray(messages)) throw new ZaapiPayloadError('Zaapi message event has no data.messages array')
    return messages.map(toIncomingMessage).filter((m): m is IncomingMessage => m !== null)
  },

  async sendReply(reply): Promise<SendResult> {
    const apiKey = process.env.ZAAPI_API_KEY
    if (!apiKey) return { status: 'failed', errorMessage: 'ZAAPI_API_KEY is not set' }
    const convId = reply.externalConversationId
    // encodeURIComponent leaves '.' alone, so '..' would retarget the request path.
    if (!convId || convId === '.' || convId === '..') return { status: 'failed', errorMessage: 'Invalid conversation id' }
    try {
      // Inside try: encodeURIComponent throws URIError on lone surrogates.
      const url = `${ZAAPI_API_BASE_URL}/conversations/${encodeURIComponent(convId)}/messages`
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply.body }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      })
      if (!res.ok) return { status: 'failed', errorMessage: `Zaapi returned HTTP ${res.status}` }
      const data: unknown = await res.json().catch(() => null)
      const id = isObject(data) ? data.id : undefined
      // A 2xx without an id may mean the message went out; the caller should not auto-retry it.
      if (!nonEmptyString(id)) return { status: 'failed', errorMessage: 'Zaapi response had no message id' }
      return { status: 'sent', externalMessageId: id }
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      return { status: 'failed', errorMessage: timedOut ? 'Zaapi request timed out' : 'Zaapi request failed' }
    }
  },
}
