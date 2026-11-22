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
import type { PlatformAdapter, SendResult } from './types'

// Formats follow https://developers.respond.io/docs/webhooks/lwocem4sq812x-overview
// and https://developers.respond.io/docs/api/a748f5bfb1bb5-send-a-message
export const RESPOND_IO_SIGNATURE_HEADER = 'x-webhook-signature'
export const RESPOND_IO_API_BASE_URL = 'https://api.respond.io/v2'
export const RESPOND_IO_MESSAGE_EVENTS = ['message.received', 'message.sent']
const SEND_TIMEOUT_MS = 30_000

// Every field is read through these paths, rooted at the envelope; first match wins.
// shortcut: telegram, viber, wechat, email, sms sources match no channel token and are rejected, extend toChannel once the CX channel list grows
const RESPOND_IO_FIELDS = {
  eventType: ['event_type', 'eventType', 'event'],
  message: ['message'],
  id: ['message.messageId', 'message.id', 'message.message_id'],
  // respond.io has no conversation id; a contact's thread is its conversation.
  conversationId: ['message.contactId', 'message.contact_id', 'contact.id'],
  direction: ['message.traffic', 'message.direction'],
  sentAt: ['message.timestamp', 'message.created_at', 'message.createdAt'],
  text: ['message.message.text', 'message.text', 'message.message.body'],
  messageType: ['message.message.type'],
  attachments: ['message.message.attachment', 'message.message.attachments'],
  channel: ['channel.source', 'channel.type', 'message.channel.source'],
  firstName: ['contact.firstName', 'contact.first_name'],
  lastName: ['contact.lastName', 'contact.last_name'],
  name: ['contact.name', 'contact.fullName', 'contact.full_name'],
  sentMessageId: ['messageId', 'data.messageId', 'id', 'data.id'],
} as const
const ATTACHMENT_TYPES = ['attachment', 'image', 'video', 'audio', 'file', 'sticker']

export class RespondIoPayloadError extends AdapterPayloadError {
  name = 'RespondIoPayloadError'
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// The header may be base64 or hex (either case), optionally prefixed with `sha256=`.
function signatureCandidates(header: string): Buffer[] {
  const sig = header.replace(/^sha256=/i, '')
  const out: Buffer[] = []
  if (/^[0-9a-f]{64}$/i.test(sig)) out.push(Buffer.from(sig, 'hex'))
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(sig)) out.push(Buffer.from(sig, 'base64'))
  return out
}

const hmacMatches = (secret: string, data: Buffer | string, candidates: Buffer[]) => {
  const expected = createHmac('sha256', secret).update(data).digest()
  return candidates.some((given) => given.length === expected.length && timingSafeEqual(given, expected))
}

export const respondIoAdapter: PlatformAdapter = {
  // shortcut: respond.io sends no timestamp header, so replays within its retry window pass; dedupe on externalId downstream
  async verifyWebhook(req) {
    const bytes = Buffer.from(await req.arrayBuffer())
    const rawPayload = new TextDecoder().decode(bytes)
    const secret = process.env.RESPOND_IO_WEBHOOK_SECRET
    const given = signatureCandidates(req.headers.get(RESPOND_IO_SIGNATURE_HEADER) ?? '')
    if (!secret || given.length === 0) return { valid: false, rawPayload }
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

  // Throws RespondIoPayloadError (with .field) for invalid JSON, a non-object, or a message event with
  // a missing or unusable field, including an unmapped channel. Returns [] for other events.
  async parseWebhook(rawPayload) {
    const envelope = parseObject(rawPayload, RespondIoPayloadError)
    const F = RESPOND_IO_FIELDS
    const eventType = normalizeEventType(pick(envelope, F.eventType))
    if (!eventType || !RESPOND_IO_MESSAGE_EVENTS.includes(eventType)) return []
    const need = <T>(field: keyof typeof F, coerce: (v: unknown) => T | null) =>
      required(envelope, field, F[field], coerce, RespondIoPayloadError)
    need('message', (v) => (typeof v === 'object' && !Array.isArray(v) ? v : null))
    const id = need('id', toId)
    const contactId = need('conversationId', toId)
    const direction = need('direction', toDirection)
    // The docs show both 10-digit (s) and 13-digit (ms) timestamps without stating a unit; toDate handles both.
    const sentAt = need('sentAt', toDate)
    const channel = need('channel', toChannel)
    const text = pick(envelope, F.text)
    const name =
      [pick(envelope, F.firstName), pick(envelope, F.lastName)].map(str).filter(Boolean).join(' ') ||
      str(pick(envelope, F.name))
    return [
      {
        externalId: id,
        externalConversationId: contactId,
        platform: 'respond_io',
        channel,
        direction,
        senderName: direction === 'inbound' && name ? name : null,
        body: typeof text === 'string' ? text : null,
        hasAttachment:
          ATTACHMENT_TYPES.includes(str(pick(envelope, F.messageType)).toLowerCase()) || hasAny(envelope, F.attachments),
        sentAt,
      },
    ]
  },

  // The caller must not auto-retry an unconfirmed send: respond.io has no idempotency key, so a retry can double-send.
  // shortcut: no channelId is sent, so respond.io uses the contact's last interacted channel; pass it once OutboundReply carries one
  async sendReply(reply): Promise<SendResult> {
    const apiKey = process.env.RESPOND_IO_API_KEY
    if (!apiKey) return { status: 'failed', errorMessage: 'RESPOND_IO_API_KEY is not set' }
    // Stays digits-only: the id is interpolated into the URL path.
    const contactId = /^\d+$/.test(reply.externalConversationId) ? reply.externalConversationId : null
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
      if (!res.ok) return { status: res.status >= 500 ? 'unconfirmed' : 'failed', errorMessage: `respond.io returned HTTP ${res.status}` }
      const json: unknown = await res.json().catch(() => null)
      return { status: 'sent', externalMessageId: toId(pick(json, RESPOND_IO_FIELDS.sentMessageId)) }
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      return { status: 'unconfirmed', errorMessage: timedOut ? 'respond.io request timed out' : 'respond.io request failed' }
    }
  },
}
