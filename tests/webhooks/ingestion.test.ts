import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  connectSupervisor,
  conversations,
  db,
  messages,
  resetTables,
  respondIoEvent,
  respondIoRequest,
  respondIoRoute,
  runMigrations,
  signRespondIo,
  signZaapi,
  stubWebhookEnv,
  users,
  webhookLog,
  zaapiEvent,
  zaapiRequest,
  zaapiRoute,
} from './helpers'

const { configureAutoAssign } = await import('@/lib/services/assignment')

const cases = [
  { platform: 'zaapi', route: zaapiRoute, request: zaapiRequest, sign: signZaapi, event: zaapiEvent },
  { platform: 'respond_io', route: respondIoRoute, request: respondIoRequest, sign: signRespondIo, event: respondIoEvent },
] as const

let sse: ReturnType<typeof connectSupervisor>

beforeAll(() => runMigrations())
beforeEach(() => {
  resetTables()
  stubWebhookEnv()
  sse = connectSupervisor('sup-client')
})
afterEach(() => {
  sse.disconnect()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe.each(cases)('POST /api/webhooks for $platform', ({ platform, route, request, sign, event }) => {
  it('ingests a signed message, emits SSE, and logs it processed', async () => {
    const body = event()
    const res = await route.POST(request(body, sign(body)))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
    const [conv] = db.select().from(conversations).all()
    expect(conv).toMatchObject({ platform, channel: 'whatsapp' })
    expect(db.select().from(messages).all()).toEqual([
      expect.objectContaining({ conversationId: conv.id, body: 'Where is my synthetic order?' }),
    ])
    expect(sse.events.map((e) => e.type)).toEqual(['conversation.created', 'message.created'])
    expect(db.select().from(webhookLog).all()).toEqual([
      expect.objectContaining({ platform, verified: 1, processingStatus: 'processed', errorMessage: null }),
    ])
  })

  it('rejects an invalid signature with 401 and stores nothing but the log entry', async () => {
    const body = event()
    const res = await route.POST(request(body, sign(event('tampered'))))

    expect(res.status).toBe(401)
    expect(await res.text()).toBe('')
    expect(db.select().from(conversations).all()).toEqual([])
    expect(db.select().from(messages).all()).toEqual([])
    expect(sse.events).toEqual([])
    expect(db.select().from(webhookLog).all()).toEqual([
      expect.objectContaining({ platform, verified: 0, processingStatus: 'rejected', errorMessage: null }),
    ])
  })

  it('rejects a missing signature with 401', async () => {
    const res = await route.POST(request(event()))
    expect(res.status).toBe(401)
    expect(db.select().from(webhookLog).all()).toEqual([expect.objectContaining({ processingStatus: 'rejected' })])
  })

  it('answers 500 for a signed but malformed payload and logs no payload text', async () => {
    const body = '{"text":"SYNTHETIC-SECRET-MARKER'
    const res = await route.POST(request(body, sign(body)))

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('')
    const [log] = db.select().from(webhookLog).all()
    expect(log).toMatchObject({ platform, verified: 1, processingStatus: 'failed' })
    expect(log.errorMessage).toMatch(/^\w+PayloadError(\.\w+)?$/)
    expect(JSON.stringify(log)).not.toContain('SYNTHETIC-SECRET-MARKER')
    expect(db.select().from(conversations).all()).toEqual([])
    expect(sse.events).toEqual([])
  })
})

describe('POST /api/webhooks/zaapi lookup failure', () => {
  it('answers 503 so Zaapi retries, and logs only the error name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"SYNTHETIC-SECRET-MARKER"}', { status: 500 })))
    const body = zaapiEvent()
    const res = await zaapiRoute.POST(zaapiRequest(body, signZaapi(body)))

    expect(res.status).toBe(503)
    expect(db.select().from(webhookLog).all()).toEqual([
      expect.objectContaining({ verified: 1, processingStatus: 'failed', errorMessage: 'ZaapiLookupError' }),
    ])
    expect(db.select().from(conversations).all()).toEqual([])
  })
})

describe('POST /api/webhooks auto-assign', () => {
  it('assigns a new conversation by the configured round-robin rule', async () => {
    db.insert(users)
      .values({ id: 'agent-a', username: 'agent-a', passwordHash: 'x', displayName: 'agent-a', role: 'agent', createdAt: 0 })
      .onConflictDoNothing()
      .run()
    expect(configureAutoAssign({ strategy: 'round_robin' }, 'sup').ok).toBe(true)
    const body = zaapiEvent()
    const res = await zaapiRoute.POST(zaapiRequest(body, signZaapi(body)))

    expect(res.status).toBe(200)
    expect(db.select().from(conversations).all()).toEqual([expect.objectContaining({ assignedAgentId: 'agent-a' })])
    expect(sse.events.map((e) => e.type)).toContain('conversation.assigned')
  })
})
