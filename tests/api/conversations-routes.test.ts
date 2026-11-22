import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { agent, detail, insertConversation, list, patchStatus, resetTables, setupDb, supervisor } from './helpers'

beforeAll(setupDb)
beforeEach(resetTables)

describe('conversations routes', () => {
  it('reject requests without a session', async () => {
    const { id } = insertConversation()
    for (const res of [await list(null), await detail(null, id), await patchStatus(null, id, '{"toStatus":"resolved"}')]) {
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'unauthorized' })
    }
  })

  it('reject an unknown enum value in the list query', async () => {
    const res = await list(supervisor, '?channel=fax')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_query', field: 'channel' })
  })

  it('assignedTo=unassigned returns only unassigned conversations', async () => {
    const free = insertConversation({ assignedAgentId: null })
    insertConversation({ assignedAgentId: 'agent-a' })
    const { items } = await (await list(supervisor, '?assignedTo=unassigned')).json()
    expect(items.map((c: { id: string }) => c.id)).toEqual([free.id])
  })

  it('page=nextCursor returns the next page', async () => {
    const ids = Array.from({ length: 51 }, () => insertConversation().id)
    const first = await (await list(supervisor)).json()
    expect(first.items).toHaveLength(50)
    expect(first.nextCursor).toEqual(expect.any(String))

    const second = await (await list(supervisor, `?page=${encodeURIComponent(first.nextCursor)}`)).json()
    expect(second).toEqual({ items: [expect.objectContaining({ id: ids[0] })], nextCursor: null })
  })

  it('detail returns the conversation and its messages', async () => {
    const { id } = insertConversation({ assignedAgentId: 'agent-a' })
    const res = await detail(agent('agent-a'), id)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ conversation: expect.objectContaining({ id }), messages: [] })
  })

  it('PATCH status applies a valid transition', async () => {
    const { id } = insertConversation()
    const res = await patchStatus(supervisor, id, JSON.stringify({ toStatus: 'resolved', reason: 'done' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id, status: 'resolved' })
  })

  it.each([
    [
      'an invalid transition',
      { status: 'resolved' },
      { toStatus: 'snoozed', snoozedUntil: Date.now() + 60_000 },
      409,
      'invalid_transition',
    ],
    ['a snooze without a time', {}, { toStatus: 'snoozed' }, 400, 'snooze_time_required'],
    ['an unknown status', {}, { toStatus: 'closed' }, 400, 'invalid_body'],
    ['a non-numeric snoozedUntil', {}, { toStatus: 'snoozed', snoozedUntil: 'tomorrow' }, 400, 'invalid_body'],
  ] as const)('PATCH status rejects %s', async (_, conv, body, status, error) => {
    const { id } = insertConversation(conv)
    const res = await patchStatus(supervisor, id, JSON.stringify(body))
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error })
  })

  it('PATCH status rejects malformed JSON and unknown ids', async () => {
    const { id } = insertConversation()
    const bad = await patchStatus(supervisor, id, '{not json')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid_body' })

    const missing = await patchStatus(supervisor, 'no-such-id', '{"toStatus":"resolved"}')
    expect(missing.status).toBe(404)
  })
})
