import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

process.env.DATABASE_URL = ':memory:'

const { db, runMigrations } = await import('@/lib/db')
const { users, conversations, conversationHistory, messages } = await import('@/lib/db/schema')
const { defaultRange, getMetrics, parseReportQuery } = await import('@/lib/services/report')

const at = (iso: string) => Date.parse(iso)
const DAY = '2026-11-23'

beforeAll(() => {
  runMigrations()
  db.insert(users).values({ id: 'agent-a', username: 'agent-a', passwordHash: 'x', displayName: 'agent-a', role: 'agent', createdAt: 0 }).run()
})

beforeEach(() => {
  db.delete(conversationHistory).run()
  db.delete(messages).run()
  db.delete(conversations).run()
})

let seq = 0
function insertConversation(over: Partial<typeof conversations.$inferInsert> = {}) {
  const id = `c${++seq}`
  db.insert(conversations)
    .values({ id, externalId: id, platform: 'zaapi', channel: 'whatsapp', createdAt: at(`${DAY}T12:00:00+08:00`), updatedAt: 0, ...over })
    .run()
  return id
}

function insertMessage(conversationId: string, direction: 'inbound' | 'outbound', createdAt: number) {
  const id = `m${++seq}`
  db.insert(messages).values({ id, conversationId, externalId: id, direction, body: 'synthetic', status: 'delivered', createdAt }).run()
}

function insertResolved(conversationId: string, changedAt: number) {
  db.insert(conversationHistory).values({ id: `h${++seq}`, conversationId, toStatus: 'resolved', changedAt }).run()
}

describe('date range in Malaysia time', () => {
  it('includes the whole Malaysian day and nothing either side', () => {
    insertConversation({ createdAt: at('2026-11-23T00:00:00.000+08:00') })
    insertConversation({ createdAt: at('2026-11-23T23:59:59.999+08:00') })
    insertConversation({ createdAt: at('2026-11-24T00:00:00.000+08:00') })
    // 15:59Z on the 22nd: the 22nd in Malaysia, so outside the range.
    insertConversation({ createdAt: at('2026-11-22T23:59:59.999+08:00') })
    // 20:00Z on the 23rd: already the 24th in Malaysia.
    insertConversation({ createdAt: at('2026-11-23T20:00:00Z') })

    expect(getMetrics(DAY, DAY, {}).totals.received).toBe(2)
  })

  it('defaults to Monday of the current ISO week through today', () => {
    // Monday 04:00 in Malaysia, still Sunday in UTC.
    expect(defaultRange(at('2026-11-22T20:00:00Z'))).toEqual({ from: '2026-11-23', to: '2026-11-23' })
    expect(defaultRange(at('2026-11-29T23:59:59.999+08:00'))).toEqual({ from: '2026-11-23', to: '2026-11-29' })
    expect(defaultRange(at('2026-11-30T00:00:00+08:00'))).toEqual({ from: '2026-11-30', to: '2026-11-30' })
  })

  it('parses a query and falls back to the default week for a bad range', () => {
    const now = at('2026-11-25T12:00:00+08:00')
    expect(parseReportQuery(new URLSearchParams('from=2026-11-01&agentId=agent-a&channel=line'), now)).toEqual({
      from: '2026-11-01',
      to: '2026-11-25',
      filters: { agentId: 'agent-a', channel: 'line' },
      invalidField: undefined,
    })
    expect(parseReportQuery(new URLSearchParams('to=2026-11-20'), now)).toMatchObject({
      from: '2026-11-23',
      to: '2026-11-25',
      invalidField: 'from',
    })
  })
})

describe('getMetrics', () => {
  it('returns zeros and no averages for an empty range', () => {
    expect(getMetrics(DAY, DAY, {})).toEqual({
      range: { from: DAY, to: DAY },
      summary: { open: 0, queue: 0, snoozed: 0 },
      totals: { received: 0, resolved: 0, avgFirstResponseMs: null, avgResolutionMs: null, lowVolume: true },
      breakdown: { agent: [], channel: [], platform: [] },
    })
  })

  it('measures first response from the first inbound message and resolution from the latest resolve', () => {
    const created = at(`${DAY}T09:00:00+08:00`)
    const id = insertConversation({ createdAt: created, status: 'resolved', assignedAgentId: 'agent-a' })
    insertMessage(id, 'outbound', created + 500) // greeting before the customer writes: not a response
    insertMessage(id, 'inbound', created + 1_000)
    insertMessage(id, 'inbound', created + 30_000)
    insertMessage(id, 'outbound', created + 61_000)
    insertMessage(id, 'outbound', created + 120_000)
    insertResolved(id, created + 1_800_000) // resolved, reopened, then resolved again
    insertResolved(id, created + 3_600_000)

    const metrics = { received: 1, resolved: 1, avgFirstResponseMs: 60_000, avgResolutionMs: 3_600_000, lowVolume: true }
    const report = getMetrics(DAY, DAY, {})
    expect(report.totals).toEqual(metrics)
    expect(report.breakdown.agent).toEqual([{ key: 'agent-a', ...metrics }])
  })

  it('averages only over conversations that have the measurement', () => {
    const created = at(`${DAY}T09:00:00+08:00`)
    const a = insertConversation({ createdAt: created })
    insertMessage(a, 'inbound', created)
    insertMessage(a, 'outbound', created + 10_000)
    const b = insertConversation({ createdAt: created })
    insertMessage(b, 'inbound', created)
    insertMessage(b, 'outbound', created + 30_000)
    insertConversation({ createdAt: created }) // never answered

    expect(getMetrics(DAY, DAY, {}).totals).toMatchObject({ received: 3, avgFirstResponseMs: 20_000, avgResolutionMs: null })
  })

  it.each([
    [9, true],
    [10, false],
  ])('flags low volume with %i resolved conversations: %s', (count, lowVolume) => {
    for (let i = 0; i < count; i++) insertConversation({ status: 'resolved' })
    insertConversation({ status: 'open' })
    const report = getMetrics(DAY, DAY, {})
    expect(report.totals).toMatchObject({ resolved: count, lowVolume })
    expect(report.breakdown.channel).toMatchObject([{ key: 'whatsapp', lowVolume }])
  })

  it('groups unassigned conversations under one key and filters by it', () => {
    insertConversation({ assignedAgentId: 'agent-a' })
    insertConversation()
    insertConversation()
    const report = getMetrics(DAY, DAY, { agentId: 'unassigned' })
    expect(report.totals.received).toBe(2)
    expect(report.breakdown.agent.map((r) => r.key)).toEqual(['unassigned'])
  })

  it('counts the live summary across all dates, waking expired snoozes first', () => {
    const outside = at('2026-01-01T12:00:00+08:00')
    insertConversation({ createdAt: outside })
    insertConversation({ createdAt: outside, assignedAgentId: 'agent-a' })
    insertConversation({ createdAt: outside, status: 'snoozed', snoozedUntil: Date.now() + 3_600_000 })
    insertConversation({ createdAt: outside, status: 'snoozed', snoozedUntil: Date.now() - 1 })
    insertConversation({ createdAt: outside, status: 'resolved' })

    expect(getMetrics(DAY, DAY, {}).summary).toEqual({ open: 3, queue: 2, snoozed: 1 })
  })
})
