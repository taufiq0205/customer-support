import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { agent, db, insertConversation, notifications, postAssign, resetTables, setupDb, supervisor, users } from './helpers'

const to = (agentId: string) => JSON.stringify({ agentId })

beforeAll(() => {
  setupDb()
  db.insert(users)
    .values({ id: 'agent-off', username: 'agent-off', passwordHash: 'x', displayName: 'agent-off', role: 'agent', createdAt: 0, isActive: 0 })
    .run()
})
beforeEach(resetTables)

describe('POST /api/conversations/[id]/assign', () => {
  it('lets a supervisor assign any conversation and notifies the assignee', async () => {
    const { id } = insertConversation({ assignedAgentId: 'agent-a' })
    const res = await postAssign(supervisor, id, to('agent-b'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id, assignedAgentId: 'agent-b' })
    expect(db.select().from(notifications).all()).toEqual([
      expect.objectContaining({ userId: 'agent-b', conversationId: id, type: 'assigned' }),
    ])
  })

  it('lets an agent self-assign an unassigned conversation', async () => {
    const { id } = insertConversation()
    const res = await postAssign(agent('agent-a'), id, to('agent-a'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id, assignedAgentId: 'agent-a' })
  })

  it('forbids an agent assigning to another agent', async () => {
    const { id } = insertConversation()
    const res = await postAssign(agent('agent-a'), id, to('agent-b'))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
  })

  it('hides a conversation owned by another agent', async () => {
    const { id } = insertConversation({ assignedAgentId: 'agent-b' })
    expect((await postAssign(agent('agent-a'), id, to('agent-a'))).status).toBe(404)
  })

  it('rejects an invalid body', async () => {
    const { id } = insertConversation()
    for (const body of ['not json', '{}', '{"agentId":5}', '{"agentId":""}', 'null']) {
      const res = await postAssign(supervisor, id, body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_body' })
    }
  })

  it('rejects an inactive, unknown, or non-agent assignee', async () => {
    const { id } = insertConversation()
    for (const agentId of ['agent-off', 'nobody', 'sup']) {
      const res = await postAssign(supervisor, id, to(agentId))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_agent' })
    }
  })

  it('refuses to assign a resolved conversation', async () => {
    const { id } = insertConversation({ status: 'resolved' })
    const res = await postAssign(supervisor, id, to('agent-a'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'resolved' })
  })

  it('requires a session', async () => {
    const { id } = insertConversation()
    expect((await postAssign(null, id, to('agent-a'))).status).toBe(401)
  })
})
