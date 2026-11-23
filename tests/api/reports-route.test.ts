import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { agent, insertConversation, reports, resetTables, setupDb, supervisor } from './helpers'

beforeAll(setupDb)
beforeEach(resetTables)

const at = (iso: string) => Date.parse(iso)

describe('GET /api/reports', () => {
  it('requires a session', async () => {
    expect((await reports(null)).status).toBe(401)
  })

  it('is supervisor-only', async () => {
    const res = await reports(agent('agent-a'))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
  })

  it.each([
    ['?from=2026-02-30', 'from'],
    ['?from=23-11-2026', 'from'],
    ['?to=2026-11-31', 'to'],
    ['?from=2026-11-24&to=2026-11-23', 'from'],
    ['?channel=fax', 'channel'],
    ['?platform=email', 'platform'],
  ])('rejects %s', async (query, field) => {
    const res = await reports(supervisor, query)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_query', field })
  })

  it('returns metrics for the range and filters', async () => {
    insertConversation({ createdAt: at('2026-11-23T10:00:00+08:00'), channel: 'line', assignedAgentId: 'agent-a', status: 'resolved' })
    insertConversation({ createdAt: at('2026-11-23T11:00:00+08:00'), channel: 'whatsapp' })
    insertConversation({ createdAt: at('2026-11-25T10:00:00+08:00'), channel: 'line' })

    const res = await reports(supervisor, '?from=2026-11-23&to=2026-11-24&channel=line')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      range: { from: '2026-11-23', to: '2026-11-24' },
      summary: { open: 2, queue: 2, snoozed: 0 },
      totals: { received: 1, resolved: 1, avgFirstResponseMs: null, avgResolutionMs: null, lowVolume: true },
      breakdown: {
        agent: [{ key: 'agent-a', received: 1, resolved: 1, avgFirstResponseMs: null, avgResolutionMs: null, lowVolume: true }],
        channel: [{ key: 'line', received: 1, resolved: 1, avgFirstResponseMs: null, avgResolutionMs: null, lowVolume: true }],
        platform: [{ key: 'zaapi', received: 1, resolved: 1, avgFirstResponseMs: null, avgResolutionMs: null, lowVolume: true }],
      },
    })
  })
})
