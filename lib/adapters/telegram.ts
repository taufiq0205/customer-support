import { createHash, timingSafeEqual } from 'node:crypto'
import { AdapterPayloadError, parseObject, pick, required, toDate, toId } from './lenient'
import type { PlatformAdapter, SendResult } from './types'

// Formats follow https://core.telegram.org/bots/api
export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token'
export const TELEGRAM_API_BASE_URL = 'https://api.telegram.org'
const SEND_TIMEOUT_MS = 30_000
const MAX_TEXT_LENGTH = 4096
const ATTACHMENT_FIELDS = ['message.photo', 'message.document', 'message.video', 'message.audio', 'message.voice', 'message.sticker', 'message.animation', 'message.video_note']

export class TelegramPayloadError extends AdapterPayloadError {
  name = 'TelegramPayloadError'
}

// Derived from the bot token so TELEGRAM_BOT_TOKEN is the only setting. setWebhook's secret_token and the poller send it.
export const telegramWebhookSecret = (token: string) => createHash('sha256').update(`webhook:${token}`).digest('hex')

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export const telegramAdapter: PlatformAdapter = {
  async verifyWebhook(req) {
    const rawPayload = await req.text()
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) return { valid: false, rawPayload }
    const given = Buffer.from(req.headers.get(TELEGRAM_SECRET_HEADER) ?? '')
    const expected = Buffer.from(telegramWebhookSecret(token))
    return { valid: given.length === expected.length && timingSafeEqual(given, expected), rawPayload }
  },

  // Only new messages in private chats become conversations. Edits, group chats, and other update types return [].
  async parseWebhook(rawPayload) {
    const update = parseObject(rawPayload, TelegramPayloadError)
    if (!isObject(update.message) || pick(update, ['message.chat.type']) !== 'private') return []
    const need = <T>(field: string, paths: string[], coerce: (v: unknown) => T | null) =>
      required(update, field, paths, coerce, TelegramPayloadError)
    const name = [pick(update, ['message.from.first_name']), pick(update, ['message.from.last_name'])]
      .filter((s) => typeof s === 'string')
      .join(' ')
    const username = pick(update, ['message.from.username'])
    const text = pick(update, ['message.text', 'message.caption'])
    return [
      {
        externalId: need('id', ['message.message_id'], toId),
        externalConversationId: need('chatId', ['message.chat.id'], toId),
        platform: 'telegram',
        channel: 'telegram',
        direction: 'inbound',
        senderName: name || (typeof username === 'string' ? username : null),
        body: typeof text === 'string' ? text : null,
        hasAttachment: ATTACHMENT_FIELDS.some((p) => pick(update, [p]) !== undefined),
        sentAt: need('date', ['message.date'], toDate),
      },
    ]
  },

  async sendReply(reply): Promise<SendResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) return { status: 'failed', errorMessage: 'TELEGRAM_BOT_TOKEN is not set' }
    const chatId = toId(reply.externalConversationId)
    if (!chatId) return { status: 'failed', errorMessage: 'Invalid chat id' }
    if (reply.body.length < 1 || reply.body.length > MAX_TEXT_LENGTH) {
      return { status: 'failed', errorMessage: `Reply text must be 1-${MAX_TEXT_LENGTH} characters` }
    }
    try {
      const res = await fetch(`${TELEGRAM_API_BASE_URL}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: reply.body }),
        redirect: 'error',
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      })
      if (!res.ok) return { status: res.status >= 500 ? 'unconfirmed' : 'failed', errorMessage: `Telegram returned HTTP ${res.status}` }
      const messageId = toId(pick(await res.json().catch(() => null), ['result.message_id']))
      return { status: 'sent', externalMessageId: messageId }
    } catch (err) {
      // Fixed strings only: a fetch error can carry the URL, which contains the bot token.
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      return { status: 'unconfirmed', errorMessage: timedOut ? 'Telegram request timed out' : 'Telegram request failed' }
    }
  },
}
