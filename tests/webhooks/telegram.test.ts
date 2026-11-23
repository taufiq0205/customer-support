import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectSupervisor, conversations, db, messages, resetTables, runMigrations, webhookLog } from './helpers'

const route = await import('@/app/api/webhooks/telegram/route')
const { TELEGRAM_SECRET_HEADER, telegramAdapter, telegramWebhookSecret } = await import('@/lib/adapters/telegram')

const TOKEN = '123456:synthetic-telegram-token'

const update = (chatType = 'private', text = 'Where is my synthetic order?') =>
  JSON.stringify({
    update_id: 9001,
    message: {
      message_id: 55,
      from: { id: 777, is_bot: false, first_name: 'Test', last_name: 'Customer', username: 'test_customer' },
      chat: { id: 777, type: chatType },
      date: 1795000000,
      text,
    },
  })

const request = (body: string, secret = telegramWebhookSecret(TOKEN)) =>
  new Request('http://127.0.0.1/api/webhooks/telegram', { method: 'POST', body, headers: { [TELEGRAM_SECRET_HEADER]: secret } })

let sse: ReturnType<typeof connectSupervisor>
beforeAll(() => runMigrations())
beforeEach(() => {
  resetTables()
  vi.stubEnv('TELEGRAM_BOT_TOKEN', TOKEN)
  sse = connectSupervisor('sup-telegram')
})
afterEach(() => {
  sse.disconnect()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('POST /api/webhooks/telegram', () => {
  it('ingests a private chat message as a telegram conversation and emits SSE', async () => {
    const res = await route.POST(request(update()))

    expect(res.status).toBe(200)
    const [conv] = db.select().from(conversations).all()
    expect(conv).toMatchObject({ platform: 'telegram', channel: 'telegram', externalId: '777', customerName: 'Test Customer' })
    expect(db.select().from(messages).all()).toEqual([
      expect.objectContaining({ externalId: '55', direction: 'inbound', body: 'Where is my synthetic order?' }),
    ])
    expect(sse.events.map((e) => e.type)).toEqual(['conversation.created', 'message.created'])
  })

  it('rejects a wrong secret with 401 and stores nothing', async () => {
    const res = await route.POST(request(update(), 'wrong'))

    expect(res.status).toBe(401)
    expect(db.select().from(conversations).all()).toEqual([])
    expect(db.select().from(webhookLog).all()).toEqual([expect.objectContaining({ processingStatus: 'rejected' })])
  })

  it('ignores group chat messages', async () => {
    const res = await route.POST(request(update('group')))

    expect(res.status).toBe(200)
    expect(db.select().from(conversations).all()).toEqual([])
  })
})

describe('telegramAdapter.sendReply', () => {
  it('posts to sendMessage and returns the Telegram message id', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, result: { message_id: 56 } }))
    vi.stubGlobal('fetch', fetch)

    const result = await telegramAdapter.sendReply({ conversationId: 'c1', externalConversationId: '777', body: 'Hello' })

    expect(result).toEqual({ status: 'sent', externalMessageId: '56' })
    expect(fetch).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      expect.objectContaining({ body: JSON.stringify({ chat_id: '777', text: 'Hello' }) }),
    )
  })

  it('fails without a token', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    const result = await telegramAdapter.sendReply({ conversationId: 'c1', externalConversationId: '777', body: 'Hello' })
    expect(result.status).toBe('failed')
  })
})
