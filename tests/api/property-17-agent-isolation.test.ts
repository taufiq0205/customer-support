// Feature: cx-support-tool, Property 17: Agent cannot read another agent's conversations
// Validates: Requirements 10.4
import fc from 'fast-check'
import { beforeAll, describe, expect, it } from 'vitest'
import { AGENTS, agent, db, detail, insertConversation, messages, resetTables, setupDb } from './helpers'

beforeAll(setupDb)

describe('Property 17: agent isolation on the detail endpoint', () => {
  it('another agent gets 404 and no conversation data; the owner gets the conversation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.constantFrom(...AGENTS), { minLength: 2, maxLength: 2 }),
        fc.string(),
        fc.string(),
        async ([owner, intruder], customerName, body) => {
          resetTables()
          const conv = insertConversation({ assignedAgentId: owner, customerName, lastMessagePreview: body })
          db.insert(messages)
            .values({
              id: `${conv.id}-m`,
              conversationId: conv.id,
              externalId: 'm-1',
              direction: 'inbound',
              body,
              status: 'delivered',
              createdAt: 0,
            })
            .run()

          const denied = await detail(agent(intruder), conv.id)
          expect(denied.status).toBe(404)
          expect(await denied.json()).toEqual({ error: 'not_found' })

          const allowed = await detail(agent(owner), conv.id)
          expect(allowed.status).toBe(200)
          expect((await allowed.json()).conversation.id).toBe(conv.id)
        },
      ),
      { numRuns: 100 },
    )
  })
})
