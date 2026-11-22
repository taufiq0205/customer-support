import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Channel, PlatformAdapter, SendResult } from './types'

// Formats follow https://developers.respond.io/docs/webhooks/lwocem4sq812x-overview
// and https://developers.respond.io/docs/api/a748f5bfb1bb5-send-a-message
export const RESPOND_IO_SIGNATURE_HEADER = 'x-webhook-signature'
export const RESPOND_IO_API_BASE_URL = 'https://api.respond.io/v2'
export const RESPOND_IO_MESSAGE_EVENTS = ['message.received', 'message.sent']
const SEND_TIMEOUT_MS = 30_000

// shortcut: telegram, viber, wechat, email, custom_channel etc. are rejected, extend once the CX channel list grows
const RESPOND_IO_CHANNELS: Record<string, Channel> = {
  facebook: 'facebook',
  instagram: 'instagram',
  line: 'line',
  whatsapp: 'whatsapp',
  whatsapp_cloud: 'whatsapp',
  whatsapp_business: 'whatsapp',
  '360dialog_whatsapp': 'whatsapp',
  twilio_whatsapp: 'whatsapp',
  message_bird_whatsapp: 'whatsapp',
  nexmo_whatsapp: 'whatsapp',
}

// Thrown when the payload is unusable. The message never includes payload content.
export class RespondIoPayloadError extends Error {
  name = 'RespondIoPayloadError'
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
// respond.io ids are integers in the docs; accept digit strings too.
const toId = (v: unknown): string | null =>
  (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) || (typeof v === 'string' && /^\d+$/.test(v)) ? String(v) : null

const hmacMatches = (secret: string, data: Buffer | string, given: Buffer) => {
  const expected = createHmac('sha256', secret).update(data).digest()
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export const respondIoAdapter: PlatformAdapter = {
  // shortcut: respond.io sends no timestamp header, so replays within its retry window pass; dedupe on externalId downstream
  async verifyWebhook(req) {
    const bytes = Buffer.from(await req.arrayBuffer())
    const rawPayload = new TextDecoder().decode(bytes)
    const secret = process.env.RESPOND_IO_WEBHOOK_SECRET
    const header = req.headers.get(RESPOND_IO_SIGNATURE_HEADER) ?? ''
    if (!secret || !/^[A-Za-z0-9+/]+={0,2}$/.test(header)) return { valid: false, rawPayload }
    const given = Buffer.from(header, 'base64')
    if (hmacMatches(secret, bytes, given)) return { valid: true, rawPayload }
    // The docs' Node example signs JSON.stringify(parsedBody), not the raw bytes.
    let restringified: string
    try {
      restringified = JSON.stringify(JSON.parse(rawPayload))
    } catch {
      return { valid: false, rawPayload }
    }
    return { valid: hmacMatches(secret, restringified, given), rawPayload }
  },

  // Throws RespondIoPayloadError for invalid JSON, a non-object, a malformed message event, or an
  // unmapped channel. Returns [] for events that are not message events.
  async parseWebhook(rawPayload) {
    let envelope: unknown
    try {
      envelope = JSON.parse(rawPayload)
    } catch {
      throw new RespondIoPayloadError('respond.io webhook payload is not valid JSON')
    }
    if (!isObject(envelope)) throw new RespondIoPayloadError('respond.io webhook payload is not an object')
    if (!RESPOND_IO_MESSAGE_EVENTS.includes(envelope.event_type as string)) return []
    const { message: m, contact, channel } = envelope
    if (!isObject(m)) throw new RespondIoPayloadError('respond.io message event has no message object')
    const id = toId(m.messageId)
    // respond.io has no conversation id; a contact's thread is its conversation.
    const contactId = toId(m.contactId) ?? (isObject(contact) ? toId(contact.id) : null)
    const direction = m.traffic === 'incoming' ? 'inbound' : m.traffic === 'outgoing' ? 'outbound' : null
    // The docs show both 10-digit (s) and 13-digit (ms) timestamps without stating a unit.
    const ts = m.timestamp
    const sentAt = typeof ts === 'number' && ts > 0 ? new Date(ts > 1e12 ? ts : ts * 1000) : null
    if (!id || !contactId || !direction || !sentAt || Number.isNaN(sentAt.getTime())) {
      throw new RespondIoPayloadError('respond.io message is missing a required field')
    }
    const source = isObject(channel) ? channel.source : undefined
    if (typeof source !== 'string' || !Object.hasOwn(RESPOND_IO_CHANNELS, source)) {
      throw new RespondIoPayloadError('respond.io message has a missing or unmapped channel')
    }
    const content = isObject(m.message) ? m.message : {}
    const name = isObject(contact)
      ? [contact.firstName, contact.lastName].filter((s) => typeof s === 'string' && s.trim()).join(' ')
      : ''
    return [
      {
        externalId: id,
        externalConversationId: contactId,
        platform: 'respond_io',
        channel: RESPOND_IO_CHANNELS[source],
        direction,
        senderName: direction === 'inbound' && name ? name : null,
        body: typeof content.text === 'string' ? content.text : null,
        hasAttachment: content.type === 'attachment',
        sentAt,
      },
    ]
  },

  // The caller must not auto-retry a failure: respond.io has no idempotency key, so a retry can double-send.
  // shortcut: no channelId is sent, so respond.io uses the contact's last interacted channel; pass it once OutboundReply carries one
  async sendReply(reply): Promise<SendResult> {
    const apiKey = process.env.RESPOND_IO_API_KEY
    if (!apiKey) return { status: 'failed', errorMessage: 'RESPOND_IO_API_KEY is not set' }
    const contactId = toId(reply.externalConversationId)
    if (!contactId) return { status: 'failed', errorMessage: 'Invalid contact id' }
    if (reply.body.trim().length === 0) return { status: 'failed', errorMessage: 'Reply text must not be empty' }
    try {
      const res = await fetch(`${RESPOND_IO_API_BASE_URL}/contact/id:${contactId}/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { type: 'text', text: reply.body } }),
        redirect: 'error',
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      })
      // The error body's message may echo input, so report only the status.
      if (!res.ok) return { status: 'failed', errorMessage: `respond.io returned HTTP ${res.status}` }
      const json: unknown = await res.json().catch(() => null)
      return { status: 'sent', externalMessageId: isObject(json) ? toId(json.messageId) : null }
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      return { status: 'failed', errorMessage: timedOut ? 'respond.io request timed out' : 'respond.io request failed' }
    }
  },
}
