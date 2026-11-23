// Feature: cx-support-tool, Property 16: Agent role cannot access supervisor-only endpoints
// Validates: Requirements 9.3, 9.4
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fc from 'fast-check'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/auth/session'
import {
  AGENTS,
  agent,
  cannedResponses,
  conversations,
  db,
  deleteCanned,
  getAISettings,
  insertConversation,
  postAssign,
  postCanned,
  putAISettings,
  putCanned,
  reports,
  resetTables,
  setupDb,
} from './helpers'

const CANNED_ID = 'canned-seed'
const canned = JSON.stringify({ name: 'Synthetic', shortcode: 'synthetic', body: 'Hi' })
const envPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'property-16-')), '.env.local')

beforeAll(() => {
  setupDb()
  // Keeps a broken guard off the repo's real .env.local.
  vi.stubEnv('AI_SETTINGS_ENV_PATH', envPath)
})

type Ctx = { convId: string; otherAgent: string }

const OPS: Record<string, (s: Session, ctx: Ctx) => Promise<Response>> = {
  'GET /api/reports': (s) => reports(s),
  'GET /api/settings/ai': (s) => getAISettings(s),
  'PUT /api/settings/ai': (s) => putAISettings(s, JSON.stringify({ endpointUrl: 'http://localhost:11434', modelName: 'm' })),
  'POST /api/canned-responses': (s) => postCanned(s, canned),
  'PUT /api/canned-responses/[id]': (s) => putCanned(s, CANNED_ID, canned),
  'DELETE /api/canned-responses/[id]': (s) => deleteCanned(s, CANNED_ID),
  'POST /api/conversations/[id]/assign': (s, { convId, otherAgent }) =>
    postAssign(s, convId, JSON.stringify({ agentId: otherAgent })),
}

describe('Property 16: agent role cannot access supervisor-only endpoints', () => {
  it('every supervisor-only operation returns 403 to an agent and changes nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...AGENTS),
        fc.constantFrom(...Object.keys(OPS)),
        fc.boolean(),
        async (actor, op, ownsConversation) => {
          resetTables()
          db.delete(cannedResponses).run()
          db.insert(cannedResponses)
            .values({ id: CANNED_ID, name: 'Seed', shortcode: 'seed', body: 'Seed body', createdBy: 'sup', createdAt: 0, updatedAt: 0 })
            .run()
          // Unassigned or the actor's own, so the agent can see it and the 403 comes from the role rule, not the 404 isolation rule.
          const conv = insertConversation({ assignedAgentId: ownsConversation ? actor : null })
          const otherAgent = AGENTS.find((a) => a !== actor)!

          const res = await OPS[op](agent(actor), { convId: conv.id!, otherAgent })
          expect(res.status).toBe(403)

          expect(db.select().from(cannedResponses).all()).toEqual([
            expect.objectContaining({ id: CANNED_ID, shortcode: 'seed', body: 'Seed body' }),
          ])
          const after = db.select().from(conversations).where(eq(conversations.id, conv.id!)).get()
          expect(after?.assignedAgentId).toBe(conv.assignedAgentId ?? null)
          expect(fs.existsSync(envPath)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})
