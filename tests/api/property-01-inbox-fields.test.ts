// Feature: cx-support-tool, Property 1: Inbox items contain all required fields
// Validates: Requirements 1.4
import fc from 'fast-check'
import { beforeAll, describe, expect, it } from 'vitest'
import { CHANNELS, PLATFORMS } from '@/lib/adapters/types'
import { insertConversation, list, resetTables, setupDb, supervisor } from './helpers'

beforeAll(setupDb)

// An inbox row has at least one message and some way to name the customer.
const convArb = fc
  .record({
    platform: fc.constantFrom(...PLATFORMS),
    channel: fc.constantFrom(...CHANNELS),
    customerName: fc.option(fc.string(), { nil: null }),
    customerIdentifier: fc.option(fc.string(), { nil: null }),
    lastMessageAt: fc.integer({ min: 0, max: 2 ** 40 }),
    lastMessagePreview: fc.string(),
  })
  .filter((c) => c.customerName !== null || c.customerIdentifier !== null)

describe('Property 1: inbox item fields', () => {
  it('every listed item carries name or identifier, channel, platform, last message time and preview', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(convArb, { minLength: 1, maxLength: 20 }), async (arr) => {
        resetTables()
        const stored = new Map(arr.map((c) => [insertConversation(c).id, c]))

        const res = await list(supervisor)
        expect(res.status).toBe(200)
        const { items } = await res.json()
        expect(items).toHaveLength(arr.length)
        for (const item of items) {
          expect(item.customerName ?? item.customerIdentifier).not.toBeNull()
          expect(item).toMatchObject(stored.get(item.id)!)
        }
      }),
      { numRuns: 100 },
    )
  })
})
