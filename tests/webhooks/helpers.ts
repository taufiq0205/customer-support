import { createHmac } from 'node:crypto'
import { vi } from 'vitest'
import type { SSEEvent } from '@/lib/events/types'

// Must run before lib/db loads; test files import this module first.
process.env.DATABASE_URL = ':memory:'

export const { db, runMigrations } = await import('@/lib/db')
export const { conversations, conversationHistory, messages, webhookLog } = await import('@/lib/db/schema')
const { addClient, removeClient } = await import('@/lib/events/bus')
export const zaapiRoute = await import('@/app/api/webhooks/zaapi/route')
export const respondIoRoute = await import('@/app/api/webhooks/respond-io/route')
const { ZAAPI_SIGNATURE_HEADER } = await import('@/lib/adapters/zaapi')
const { RESPOND_IO_SIGNATURE_HEADER } = await import('@/lib/adapters/respond-io')

export const ZAAPI_SECRET = 'synthetic-zaapi-secret'
export const RESPOND_IO_SECRET = 'synthetic-respond-secret'

export const signZaapi = (body: string, secret = ZAAPI_SECRET, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
export const signRespondIo = (body: string, secret = RESPOND_IO_SECRET) =>
  createHmac('sha256', secret).update(body).digest('base64')

export const zaapiRequest = (body: string, signature?: string) =>
  new Request('http://127.0.0.1/api/webhooks/zaapi', {
    method: 'POST',
    body,
    headers: signature === undefined ? {} : { [ZAAPI_SIGNATURE_HEADER]: signature },
  })
export const respondIoRequest = (body: string, signature?: string) =>
  new Request('http://127.0.0.1/api/webhooks/respond-io', {
    method: 'POST',
    body,
    headers: signature === undefined ? {} : { [RESPOND_IO_SIGNATURE_HEADER]: signature },
  })

// Synthetic payloads shaped like the adapter test fixtures.
export const zaapiEvent = (text = 'Where is my synthetic order?') =>
  JSON.stringify({
    webhookId: 'wh-001',
    eventType: 'message.received',
    data: {
      conversationId: 'conv-001',
      message: {
        id: 'msg-001',
        conversationId: 'conv-001',
        text,
        messageCategory: 'message',
        messageDirection: 'inbound',
        sentAt: '2026-11-20T09:15:00Z',
      },
    },
  })
export const respondIoEvent = (text = 'Where is my synthetic order?') =>
  JSON.stringify({
    event_type: 'message.received',
    contact: { id: 42, firstName: 'Test', lastName: 'Customer' },
    message: { messageId: 1001, contactId: 42, traffic: 'incoming', timestamp: 1795000000000, message: { type: 'text', text } },
    channel: { id: 7, source: 'whatsapp_cloud' },
  })

// Answers the Zaapi conversation lookup that parseWebhook makes for message events.
export const stubZaapiLookup = () =>
  vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { id: 'conv-001', channel: 'whatsapp', displayName: 'Test Customer' } }), {
        status: 200,
      }),
  )

export function stubWebhookEnv() {
  vi.stubEnv('ZAAPI_WEBHOOK_SECRET', ZAAPI_SECRET)
  vi.stubEnv('ZAAPI_API_KEY', 'synthetic-api-key')
  vi.stubEnv('RESPOND_IO_WEBHOOK_SECRET', RESPOND_IO_SECRET)
  vi.stubGlobal('fetch', stubZaapiLookup())
}

export function resetTables() {
  db.delete(conversationHistory).run()
  db.delete(messages).run()
  db.delete(conversations).run()
  db.delete(webhookLog).run()
}

// Collects what a connected supervisor browser would receive.
const decoder = new TextDecoder()
export function connectSupervisor(id: string): { events: SSEEvent[]; disconnect: () => void } {
  const events: SSEEvent[] = []
  const controller = {
    enqueue: (bytes: Uint8Array) => events.push(JSON.parse(decoder.decode(bytes).replace(/^data: /, ''))),
  } as unknown as ReadableStreamDefaultController<Uint8Array>
  addClient(id, controller, 'sup', 'supervisor')
  return { events, disconnect: () => removeClient(id) }
}
