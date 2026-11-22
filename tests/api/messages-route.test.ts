import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SendResult } from '@/lib/adapters/types'
import { agent, db, insertConversation, messages, postMessage, resetTables, setupDb } from './helpers'

const { pending, sendReply } = vi.hoisted(() => ({
  pending: [] as (() => unknown)[],
  sendReply: vi.fn<() => Promise<SendResult>>(),
}))
vi.mock('next/server', () => ({ after: (cb: () => unknown) => void pending.push(cb) }))
vi.mock('@/lib/adapters/zaapi', () => ({ zaapiAdapter: { sendReply } }))
vi.mock('@/lib/adapters/respond-io', () => ({ respondIoAdapter: { sendReply } }))

const { addClient, removeClient } = await import('@/lib/events/bus')
const { deliverOutbound, storeOutbound } = await import('@/lib/services/message')
const { ingest } = await import('@/lib/services/conversation')

let events: { type: string; conversationId: string; payload: { messageId: string; status: string } }[] = []

beforeAll(setupDb)
beforeEach(() => {
  resetTables()
  pending.length = 0
  events = []
  sendReply.mockReset()
  const decoder = new TextDecoder()
  const controller = {
    enqueue: (bytes: Uint8Array) => events.push(JSON.parse(decoder.decode(bytes).replace(/^data: /, ''))),
  } as unknown as ReadableStreamDefaultController<Uint8Array>
  addClient('test', controller, 'sup', 'supervisor')
})
afterEach(() => removeClient('test'))

const findRow = (id: string) => db.select().from(messages).all().find((m) => m.id === id)

async function send(body = '{"body":"Synthetic reply"}') {
  const conv = insertConversation({ assignedAgentId: 'agent-a', platform: 'respond_io' })
  const res = await postMessage(agent('agent-a'), conv.id!, body)
  return { conv, res }
}

const flushAfter = () => Promise.all(pending.map((cb) => cb()))

describe('POST /api/conversations/[id]/messages', () => {
  it('rejects a request without a session', async () => {
    const conv = insertConversation()
    const res = await postMessage(null, conv.id!, '{"body":"hi"}')
    expect(res.status).toBe(401)
  })

  it.each(['not json', '{}', '{"body":42}', '{"body":"   "}'])('rejects body %s with 400', async (body) => {
    const { res } = await send(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
    expect(db.select().from(messages).all()).toHaveLength(0)
  })

  it("returns 404 for another agent's conversation and stores nothing", async () => {
    const conv = insertConversation({ assignedAgentId: 'agent-a' })
    const res = await postMessage(agent('agent-b'), conv.id!, '{"body":"hi"}')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(db.select().from(messages).all()).toHaveLength(0)
    expect(pending).toHaveLength(0)
  })

  it('returns 202 pending, then marks the row sent with the platform id and emits SSE', async () => {
    sendReply.mockResolvedValue({ status: 'sent', externalMessageId: 'platform-msg-1' })
    const { conv, res } = await send()
    expect(res.status).toBe(202)
    const message = await res.json()
    expect(message).toMatchObject({ status: 'pending', direction: 'outbound', body: 'Synthetic reply' })
    expect(sendReply).not.toHaveBeenCalled()

    await flushAfter()
    expect(sendReply).toHaveBeenCalledWith({
      conversationId: conv.id,
      externalConversationId: conv.externalId,
      body: 'Synthetic reply',
    })
    expect(findRow(message.id)).toMatchObject({ status: 'sent', externalId: 'platform-msg-1' })
    expect(events.map((e) => e.payload)).toEqual([
      { messageId: message.id, status: 'pending' },
      { messageId: message.id, status: 'sent' },
    ])
    expect(events.at(-1)).toMatchObject({ type: 'message.created', conversationId: conv.id })
  })

  it('keeps the placeholder external id when the platform returns none', async () => {
    sendReply.mockResolvedValue({ status: 'sent', externalMessageId: null })
    const { res } = await send()
    const message = await res.json()
    await flushAfter()
    expect(findRow(message.id)).toMatchObject({ status: 'sent', externalId: message.externalId })
  })

  it('marks the row failed when the adapter reports failure', async () => {
    sendReply.mockResolvedValue({ status: 'failed', errorMessage: 'synthetic failure' })
    const { res } = await send()
    const message = await res.json()
    await flushAfter()
    expect(findRow(message.id)?.status).toBe('failed')
    expect(events.at(-1)?.payload).toEqual({ messageId: message.id, status: 'failed' })
  })

  it('marks the row unconfirmed when the adapter throws', async () => {
    sendReply.mockRejectedValue(new Error('synthetic network error'))
    const { res } = await send()
    const message = await res.json()
    await flushAfter()
    expect(findRow(message.id)?.status).toBe('unconfirmed')
  })

  it('refuses a blind resend of an unconfirmed reply with 409 and stores nothing', async () => {
    sendReply.mockResolvedValueOnce({ status: 'unconfirmed', errorMessage: 'timeout' })
    const { conv, res } = await send()
    const first = await res.json()
    await flushAfter()
    pending.length = 0
    const retry = await postMessage(agent('agent-a'), conv.id!, '{"body":"Synthetic reply"}')
    expect(retry.status).toBe(409)
    expect(await retry.json()).toEqual({ error: 'unconfirmed_duplicate', messageId: first.id })
    expect(db.select().from(messages).all()).toHaveLength(1)
    expect(pending).toHaveLength(0)

    const other = await postMessage(agent('agent-a'), conv.id!, '{"body":"A different synthetic reply"}')
    expect(other.status).toBe(202)
  })

  it('resends an unconfirmed reply when the agent confirms', async () => {
    sendReply.mockResolvedValueOnce({ status: 'unconfirmed', errorMessage: 'timeout' })
    const { conv } = await send()
    await flushAfter()
    pending.length = 0
    sendReply.mockResolvedValueOnce({ status: 'sent', externalMessageId: 'platform-msg-3' })
    const retry = await postMessage(agent('agent-a'), conv.id!, '{"body":"Synthetic reply","confirmResend":true}')
    expect(retry.status).toBe(202)
    await flushAfter()
    expect(sendReply).toHaveBeenCalledTimes(2)
    expect(db.select().from(messages).all().map((m) => m.status)).toEqual(
      expect.arrayContaining(['unconfirmed', 'sent']),
    )
  })

  it('leaves the failed row in place when the agent retries by posting again', async () => {
    sendReply.mockResolvedValueOnce({ status: 'failed', errorMessage: 'x' })
    const { conv, res } = await send()
    await flushAfter()
    pending.length = 0
    sendReply.mockResolvedValueOnce({ status: 'sent', externalMessageId: 'platform-msg-2' })
    const retry = await postMessage(agent('agent-a'), conv.id!, '{"body":"Synthetic reply"}')
    await flushAfter()
    expect(sendReply).toHaveBeenCalledTimes(2)
    const statuses = db.select().from(messages).all().map((m) => [m.id, m.status])
    expect(statuses).toEqual(
      expect.arrayContaining([
        [(await res.json()).id, 'failed'],
        [(await retry.json()).id, 'sent'],
      ]),
    )
  })
})

describe('deliverOutbound', () => {
  const hanging = { sendReply: () => new Promise<SendResult>(() => {}) }

  function store() {
    const conv = insertConversation({ assignedAgentId: 'agent-a' })
    const stored = storeOutbound(conv.id!, 'Synthetic reply', agent('agent-a'))
    if (!stored.ok) throw new Error('store failed')
    const reply = { conversationId: conv.id!, externalConversationId: conv.externalId, body: 'Synthetic reply' }
    return { conv, message: stored.value, reply }
  }

  it('marks the row unconfirmed when the adapter does not answer before the timeout', async () => {
    const { message, reply } = store()
    const result = await deliverOutbound(message, reply, hanging as never, 10)
    expect(result.status).toBe('unconfirmed')
    expect(findRow(message.id)?.status).toBe('unconfirmed')
    expect(events.at(-1)?.payload).toEqual({ messageId: message.id, status: 'unconfirmed' })
  })

  it('leaves a row the platform echo already confirmed as sent when the timeout fires later', async () => {
    const { conv, message, reply } = store()
    const delivery = deliverOutbound(message, reply, hanging as never, 10)
    ingest([
      {
        externalId: 'echo-1',
        externalConversationId: conv.externalId,
        platform: 'zaapi',
        channel: 'whatsapp',
        direction: 'outbound',
        senderName: null,
        body: 'Synthetic reply',
        hasAttachment: false,
        sentAt: new Date(5_000),
      },
    ])
    expect(await delivery).toMatchObject({ status: 'sent', externalId: 'echo-1' })
    expect(findRow(message.id)).toMatchObject({ status: 'sent', externalId: 'echo-1' })
    expect(events.map((e) => e.payload.status)).toEqual(['pending', 'sent'])
  })
})
