import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/events/route'
import { createSession, type Role } from '@/lib/auth/session'
import { addClient, emit, removeClient } from '@/lib/events/bus'
import type { SSEEvent } from '@/lib/events/types'

const decoder = new TextDecoder()
const event = (conversationId: string): SSEEvent => ({ type: 'message.created', conversationId, payload: {} })
const parse = (text: string) =>
  text.split('\n\n').filter((f) => f.startsWith('data: ')).map((f) => JSON.parse(f.slice(6)) as SSEEvent)

const ids: string[] = []
afterEach(() => {
  ids.splice(0).forEach(removeClient)
  vi.useRealTimers()
})

// Registers a client and returns a function that closes its stream and returns every event it received.
function client(id: string, userId: string, role: Role) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({ start: (c) => { controller = c } })
  addClient(id, controller, userId, role)
  ids.push(id)
  return async () => {
    controller.close()
    return parse(decoder.decode(new Uint8Array(await new Response(stream).arrayBuffer())))
  }
}

describe('event bus', () => {
  it('delivers every event to supervisors', async () => {
    const received = client('s', 'sup-1', 'supervisor')
    emit(event('c1'))
    emit(event('c2'), 'agent-1')
    expect((await received()).map((e) => e.conversationId)).toEqual(['c1', 'c2'])
  })

  it('delivers to agents only when the event is visible to them or unscoped', async () => {
    const a1 = client('a1', 'agent-1', 'agent')
    const a2 = client('a2', 'agent-2', 'agent')
    emit(event('mine'), 'agent-1')
    emit(event('theirs'), 'agent-2')
    emit(event('broadcast'))
    expect((await a1()).map((e) => e.conversationId)).toEqual(['mine', 'broadcast'])
    expect((await a2()).map((e) => e.conversationId)).toEqual(['theirs', 'broadcast'])
  })

  it('stops delivery after removeClient', async () => {
    const received = client('s', 'sup-1', 'supervisor')
    emit(event('before'))
    removeClient('s')
    emit(event('after'))
    expect((await received()).map((e) => e.conversationId)).toEqual(['before'])
  })
})

describe('GET /api/events', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret'
  })

  const open = async (signal?: AbortSignal) => {
    const cookie = (await createSession('sup-1', 'supervisor')).split(';')[0]
    return GET(new Request('http://127.0.0.1/api/events', { headers: { cookie }, signal }))
  }
  const nextText = async (reader: ReadableStreamDefaultReader<Uint8Array>) =>
    decoder.decode((await reader.read()).value)
  // Resolves 'nothing' when no chunk is already queued; enqueued chunks resolve read() within microtasks.
  const nothingQueued = (reader: ReadableStreamDefaultReader<Uint8Array>) =>
    Promise.race([reader.read().then(() => 'chunk'), new Promise((r) => setTimeout(r, 10, 'nothing'))])

  it('returns 401 without a session cookie', async () => {
    const res = await GET(new Request('http://127.0.0.1/api/events'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('streams emitted events to a signed-in client', async () => {
    const res = await open()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(res.headers.get('cache-control')).toBe('no-cache')
    const reader = res.body!.getReader()
    // The first chunk flushes the headers so EventSource.onopen fires at once.
    expect(await nextText(reader)).toBe(': keepalive\n\n')
    emit(event('c1'))
    expect(parse(await nextText(reader))).toEqual([event('c1')])
    await reader.cancel()
  })

  it('sends a keepalive comment every 30 seconds', async () => {
    vi.useFakeTimers()
    const reader = (await open()).body!.getReader()
    await nextText(reader) // connect comment
    vi.advanceTimersByTime(30_000)
    expect(await nextText(reader)).toBe(': keepalive\n\n')
    await reader.cancel()
  })

  it('stops delivery and keepalives once the request aborts', async () => {
    vi.useFakeTimers()
    const abort = new AbortController()
    const reader = (await open(abort.signal)).body!.getReader()
    await nextText(reader) // connect comment
    abort.abort()
    vi.advanceTimersByTime(30_000)
    expect(() => emit(event('c1'))).not.toThrow()
    vi.useRealTimers()
    expect(await nothingQueued(reader)).toBe('nothing')
  })

  it('cleans up when the client cancels the stream', async () => {
    vi.useFakeTimers()
    const reader = (await open()).body!.getReader()
    expect(vi.getTimerCount()).toBe(1)
    await reader.cancel()
    expect(vi.getTimerCount()).toBe(0)
    expect(() => emit(event('c1'))).not.toThrow()
  })
})
