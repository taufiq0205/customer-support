// Feature: cx-support-tool, Property 18: Invalid webhook signatures are always rejected
// Validates: Requirements 10.5
import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  RESPOND_IO_SECRET,
  ZAAPI_SECRET,
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
  webhookLog,
  zaapiEvent,
  zaapiRequest,
  zaapiRoute,
} from './helpers'

let sse: ReturnType<typeof connectSupervisor>

beforeAll(() => {
  runMigrations()
  // The lookup stub answers, so a payload that slipped past verification would persist.
  stubWebhookEnv()
  sse = connectSupervisor('sup-client')
})
afterAll(() => {
  sse.disconnect()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// Valid message events are included so a verification bypass would show up as stored rows.
const payload = (event: (text?: string) => string) =>
  fc.oneof(fc.string(), fc.json(), fc.string().map((text) => event(text)))
const hex = fc.stringMatching(/^[0-9a-f]{1,64}$/)

const cases = [
  {
    platform: 'zaapi',
    route: zaapiRoute,
    request: zaapiRequest,
    payload: payload(zaapiEvent),
    // Zaapi signs the raw bytes, so a signature over any other body is a mismatch.
    signature: (body: string) =>
      fc.oneof(
        fc.string({ minLength: 1 }).filter((s) => s !== ZAAPI_SECRET).map((secret) => signZaapi(body, secret)),
        fc.string().filter((other) => other !== body).map((other) => signZaapi(other)),
        hex.map((v1) => `t=${Math.floor(Date.now() / 1000)},v1=${v1}`),
        fc.constant(undefined),
      ),
  },
  {
    platform: 'respond_io',
    route: respondIoRoute,
    request: respondIoRequest,
    payload: payload(respondIoEvent),
    // respond.io also accepts a signature over re-stringified JSON, so only foreign secrets and noise are mismatches.
    signature: (body: string) =>
      fc.oneof(
        fc.string({ minLength: 1 }).filter((s) => s !== RESPOND_IO_SECRET).map((secret) => signRespondIo(body, secret)),
        hex,
        fc.base64String({ minLength: 4 }),
        fc.constant(undefined),
      ),
  },
] as const

describe.each(cases)('Property 18 for $platform', ({ platform, route, request, payload, signature }) => {
  it('answers 401 and persists nothing for any mismatched signature', async () => {
    await fc.assert(
      fc.asyncProperty(
        payload.chain((body) => fc.tuple(fc.constant(body), signature(body))),
        async ([body, sig]) => {
          resetTables()
          sse.events.length = 0
          const res = await route.POST(request(body, sig))

          expect(res.status).toBe(401)
          expect(await res.text()).toBe('')
          expect(db.select().from(conversations).all()).toEqual([])
          expect(db.select().from(messages).all()).toEqual([])
          expect(sse.events).toEqual([])
          expect(db.select().from(webhookLog).all()).toEqual([
            expect.objectContaining({ platform, verified: 0, processingStatus: 'rejected', errorMessage: null }),
          ])
        },
      ),
      { numRuns: 100 },
    )
  })
})
