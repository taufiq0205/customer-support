import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { IncomingMessage } from '@/lib/adapters/types'
import type { Session } from '@/lib/auth/session'
import type { SSEEvent } from '@/lib/events/types'

process.env.DATABASE_URL = ':memory:'

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations, conversationHistory, messages } = await import('@/lib/db/schema')
const { addClient, removeClient } = await import('@/lib/events/bus')
const svc = await import('@/lib/services/conversation')
const msgSvc = await import('@/lib/services/message')

const supervisor: Session = { userId: 'sup', role: 'supervisor' }
const agentA: Session = { userId: 'agent-a', role: 'agent' }
const agentB: Session = { userId: 'agent-b', role: 'agent' }

let seq = 0
const incoming = (over: Partial<IncomingMessage> = {}): IncomingMessage => ({
  externalId: `m-${++seq}`,
  externalConversationId: 'c-1',
  platform: 'zaapi',
  channel: 'whatsapp',
  direction: 'inbound',
  senderName: 'Synthetic Customer',
  body: 'hello there',
  hasAttachment: false,
  sentAt: new Date(1_000_000 + seq),
  ...over,
})

// Observe SSE output the way a connected supervisor browser would.
let events: SSEEvent[] = []
const decoder = new TextDecoder()
function connect(id: string, session: Session, sink: SSEEvent[]) {
  const controller = {
    enqueue: (bytes: Uint8Array) => sink.push(JSON.parse(decoder.decode(bytes).replace(/^data: /, ''))),
  } as unknown as ReadableStreamDefaultController<Uint8Array>
  addClient(id, controller, session.userId, session.role)
}

const historyOf = (id: string) =>
  db.select().from(conversationHistory).all().filter((h) => h.conversationId === id)

beforeAll(() => {
  runMigrations()
  db.insert(users)
    .values(
      (['sup', 'agent-a', 'agent-b'] as const).map((id) => ({
        id,
        username: id,
        passwordHash: 'x',
        displayName: id,
        role: id === 'sup' ? ('supervisor' as const) : ('agent' as const),
        createdAt: 0,
      })),
    )
    .run()
})

beforeEach(() => {
  db.delete(conversationHistory).run()
  db.delete(messages).run()
  db.delete(conversations).run()
  events = []
  connect('sup-client', supervisor, events)
})

afterEach(() => removeClient('sup-client'))

describe('ingest', () => {
  it('creates a conversation once and ignores a duplicate delivery', () => {
    const m = incoming()
    const first = svc.ingest([m])
    expect(first.created).toHaveLength(1)
    const [id] = first.created
    expect(events.map((e) => e.type)).toEqual(['conversation.created', 'message.created'])

    events.length = 0
    expect(svc.ingest([m])).toEqual({ created: [], updated: [] })
    expect(events).toEqual([])

    const res = svc.getConversation(id, supervisor)
    expect(res.ok && res.value.messages.map((x) => x.status)).toEqual(['delivered'])
    expect(res.ok && res.value.conversation).toMatchObject({
      customerName: 'Synthetic Customer',
      unreadCount: 1,
      lastMessagePreview: 'hello there',
      status: 'open',
    })
  })

  it('keeps the newest preview when an older message arrives late', () => {
    const [id] = svc.ingest([incoming({ body: 'newer', sentAt: new Date(2000) })]).created
    expect(svc.ingest([incoming({ body: 'older', sentAt: new Date(1000) })]).updated).toEqual([id])
    const res = svc.getConversation(id, supervisor)
    expect(res.ok && res.value.conversation.lastMessagePreview).toBe('newer')
    expect(res.ok && res.value.messages.map((x) => x.body)).toEqual(['older', 'newer'])
  })

  it('reopens a resolved conversation on a new inbound message and records why', () => {
    const [id] = svc.ingest([incoming()]).created
    expect(svc.changeStatus(id, 'resolved', agentA).ok).toBe(true)
    events.length = 0

    svc.ingest([incoming({ body: 'one more question' })])
    const res = svc.getConversation(id, supervisor)
    expect(res.ok && res.value.conversation.status).toBe('open')
    expect(historyOf(id).map((h) => [h.fromStatus, h.toStatus, h.changedBy, h.reason])).toEqual(
      expect.arrayContaining([
        ['open', 'resolved', 'agent-a', null],
        ['resolved', 'open', null, 'new_message'],
      ]),
    )
    expect(events.map((e) => e.type)).toEqual(['message.created', 'conversation.status_changed'])
  })

  it('does not reopen or bump unread for an outbound echo', () => {
    const [id] = svc.ingest([incoming()]).created
    svc.changeStatus(id, 'resolved', supervisor)
    svc.ingest([incoming({ direction: 'outbound', senderName: null })])
    const res = svc.getConversation(id, supervisor)
    expect(res.ok && res.value.conversation).toMatchObject({ status: 'resolved', unreadCount: 1 })
  })
})

describe('access and status', () => {
  function assigned(to: string) {
    const [id] = svc.ingest([incoming({ externalConversationId: `c-${to}` })]).created
    db.update(conversations).set({ assignedAgentId: to }).run()
    return id
  }

  it("hides another agent's conversation from list, detail, and status change", () => {
    const id = assigned('agent-b')
    expect(svc.getConversations({}, agentA).items).toEqual([])
    expect(svc.getConversation(id, agentA)).toEqual({ ok: false, error: 'not_found' })
    expect(svc.changeStatus(id, 'resolved', agentA)).toEqual({ ok: false, error: 'not_found' })
    expect(svc.getConversations({}, agentB).items.map((c) => c.id)).toEqual([id])
  })

  it('agents only receive SSE events for their own or unassigned conversations', () => {
    const forA: SSEEvent[] = []
    connect('a-client', agentA, forA)
    const id = assigned('agent-b')
    svc.changeStatus(id, 'resolved', agentB)
    removeClient('a-client')
    // A saw the creation while unassigned, but nothing after it went to B.
    expect(forA.some((e) => e.type === 'conversation.status_changed')).toBe(false)
    expect(events.some((e) => e.type === 'conversation.status_changed')).toBe(true)
  })

  it('rejects invalid transitions and snoozes without a future time', () => {
    const [id] = svc.ingest([incoming()]).created
    expect(svc.changeStatus(id, 'open', supervisor)).toEqual({ ok: false, error: 'invalid_transition' })
    expect(svc.changeStatus(id, 'snoozed', supervisor)).toEqual({ ok: false, error: 'snooze_time_required' })
    expect(svc.changeStatus(id, 'snoozed', supervisor, undefined, Date.now() - 1)).toEqual({
      ok: false,
      error: 'snooze_time_required',
    })
    svc.changeStatus(id, 'resolved', supervisor)
    expect(svc.changeStatus(id, 'snoozed', supervisor, undefined, Date.now() + 60_000)).toEqual({
      ok: false,
      error: 'invalid_transition',
    })
  })

  it('lets an agent reopen a resolved conversation manually', () => {
    const [id] = svc.ingest([incoming()]).created
    svc.changeStatus(id, 'resolved', agentA)
    const res = svc.changeStatus(id, 'open', agentA, 'customer called back')
    expect(res.ok && res.value.status).toBe('open')
    expect(historyOf(id).map((h) => [h.fromStatus, h.toStatus, h.changedBy, h.reason])).toContainEqual([
      'resolved',
      'open',
      'agent-a',
      'customer called back',
    ])
  })

  it('hides a snoozed conversation until its time, then returns it as open', () => {
    const [id] = svc.ingest([incoming()]).created
    const until = Date.now() + 60_000
    expect(svc.changeStatus(id, 'snoozed', supervisor, 'waiting', until).ok).toBe(true)
    expect(svc.getConversations({ status: 'open', now: until - 1 }, supervisor).items).toEqual([])
    const after = svc.getConversations({ status: 'open', now: until }, supervisor).items
    expect(after.map((c) => [c.id, c.status, c.snoozedUntil])).toEqual([[id, 'open', null]])
    svc.getConversations({ now: until }, supervisor)
    expect(historyOf(id).filter((h) => h.reason === 'snooze_expired')).toHaveLength(1)
  })
})

describe('getConversations', () => {
  it('pages newest first and searches literally, case-insensitively', () => {
    const ids = [1, 2, 3].map(
      (n) =>
        svc.ingest([
          incoming({ externalConversationId: `p-${n}`, body: n === 2 ? 'Refund 50% OFF' : 'hi', sentAt: new Date(n * 1000) }),
        ]).created[0],
    )
    const page1 = svc.getConversations({ limit: 2 }, supervisor)
    expect(page1.items.map((c) => c.id)).toEqual([ids[2], ids[1]])
    const page2 = svc.getConversations({ limit: 2, cursor: page1.nextCursor! }, supervisor)
    expect(page2).toEqual({ items: [expect.objectContaining({ id: ids[0] })], nextCursor: null })

    expect(svc.getConversations({ search: 'refund 50%' }, supervisor).items.map((c) => c.id)).toEqual([ids[1]])
    expect(svc.getConversations({ search: '5_%' }, supervisor).items).toEqual([])
  })
})

describe('message service', () => {
  it('stores a pending outbound reply, then records the send result', () => {
    const [id] = svc.ingest([incoming()]).created
    events.length = 0
    const stored = msgSvc.storeOutbound(id, 'Thanks, checking now', agentA)
    expect(stored.ok).toBe(true)
    if (!stored.ok) return
    expect(stored.value).toMatchObject({ direction: 'outbound', status: 'pending', senderName: null })

    const sent = msgSvc.updateMessageStatus(stored.value.id, 'sent', 'zaapi-out-1')
    expect(sent.ok && sent.value).toMatchObject({ status: 'sent', externalId: 'zaapi-out-1' })
    expect(events.map((e) => e.payload)).toEqual([
      { messageId: stored.value.id, status: 'pending' },
      { messageId: stored.value.id, status: 'sent' },
    ])
    expect(msgSvc.updateMessageStatus('missing', 'failed')).toEqual({ ok: false, error: 'not_found' })
  })

  it("refuses to store a reply in another agent's conversation", () => {
    const [id] = svc.ingest([incoming()]).created
    db.update(conversations).set({ assignedAgentId: 'agent-b' }).run()
    expect(msgSvc.storeOutbound(id, 'x', agentA)).toEqual({ ok: false, error: 'not_found' })
  })
})
