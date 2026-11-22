import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { agent, db, getNotifications, insertConversation, notifications, patchNotifications, resetTables, setupDb } from './helpers'

beforeAll(setupDb)
beforeEach(resetTables)

function notify(id: string, userId: string, conversationId: string, createdAt: number, isRead = 0) {
  db.insert(notifications).values({ id, userId, conversationId, type: 'assigned', createdAt, isRead }).run()
}

const readFlags = () => Object.fromEntries(db.select().from(notifications).all().map((n) => [n.id, n.isRead]))

describe('GET /api/notifications', () => {
  it("returns only the caller's unread notifications, newest first", async () => {
    const c1 = insertConversation().id
    const c2 = insertConversation().id
    notify('old', 'agent-a', c1, 100)
    notify('new', 'agent-a', c2, 300)
    notify('read', 'agent-a', c1, 200, 1)
    notify('theirs', 'agent-b', c1, 400)

    const res = await getNotifications(agent('agent-a'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: 'new', conversationId: c2, type: 'assigned', createdAt: 300 },
      { id: 'old', conversationId: c1, type: 'assigned', createdAt: 100 },
    ])
  })

  it('requires a session', async () => {
    expect((await getNotifications(null)).status).toBe(401)
  })
})

describe('PATCH /api/notifications', () => {
  beforeEach(() => {
    const c = insertConversation().id
    notify('a1', 'agent-a', c, 1)
    notify('a2', 'agent-a', c, 2)
    notify('b1', 'agent-b', c, 3)
  })

  it('marks the listed ids read', async () => {
    const res = await patchNotifications(agent('agent-a'), JSON.stringify({ ids: ['a1'] }))
    expect(await res.json()).toEqual({ updated: 1 })
    expect(readFlags()).toEqual({ a1: 1, a2: 0, b1: 0 })
  })

  it("never touches another user's notification", async () => {
    const res = await patchNotifications(agent('agent-a'), JSON.stringify({ ids: ['a2', 'b1'] }))
    expect(await res.json()).toEqual({ updated: 1 })
    expect(readFlags()).toEqual({ a1: 0, a2: 1, b1: 0 })
  })

  it("marks all of the caller's notifications read", async () => {
    const res = await patchNotifications(agent('agent-a'), JSON.stringify({ ids: 'all' }))
    expect(await res.json()).toEqual({ updated: 2 })
    expect(readFlags()).toEqual({ a1: 1, a2: 1, b1: 0 })
    expect(await (await getNotifications(agent('agent-a'))).json()).toEqual([])
  })

  it('rejects an invalid body', async () => {
    for (const body of ['not json', 'null', '{}', '{"ids":"some"}', '{"ids":[1]}', '{"ids":"a1"}']) {
      const res = await patchNotifications(agent('agent-a'), body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_body' })
    }
    expect(readFlags()).toEqual({ a1: 0, a2: 0, b1: 0 })
  })

  it('requires a session', async () => {
    expect((await patchNotifications(null, JSON.stringify({ ids: 'all' }))).status).toBe(401)
  })
})
