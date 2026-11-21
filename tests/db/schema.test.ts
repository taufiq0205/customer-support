import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'

let sqlite: Database.Database

beforeEach(() => {
  sqlite = new Database(':memory:')
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') })
})

// Expected shape per design.md "Data Models": column -> SQLite type.
const expected: Record<string, Record<string, string>> = {
  users: { id: 'text', username: 'text', password_hash: 'text', display_name: 'text', role: 'text', created_at: 'integer', is_active: 'integer' },
  platform_configs: { id: 'text', platform: 'text', webhook_secret: 'text', is_active: 'integer' },
  conversations: {
    id: 'text', external_id: 'text', platform: 'text', channel: 'text', status: 'text', snoozed_until: 'integer',
    assigned_agent_id: 'text', customer_name: 'text', customer_identifier: 'text', unread_count: 'integer',
    last_message_at: 'integer', last_message_preview: 'text', created_at: 'integer', updated_at: 'integer',
  },
  messages: {
    id: 'text', conversation_id: 'text', external_id: 'text', direction: 'text', sender_name: 'text', body: 'text',
    has_attachment: 'integer', status: 'text', sent_at: 'integer', created_at: 'integer',
  },
  conversation_history: {
    id: 'text', conversation_id: 'text', from_status: 'text', to_status: 'text', changed_by: 'text', reason: 'text', changed_at: 'integer',
  },
  notifications: { id: 'text', user_id: 'text', conversation_id: 'text', type: 'text', is_read: 'integer', created_at: 'integer' },
  canned_responses: { id: 'text', name: 'text', shortcode: 'text', body: 'text', created_by: 'text', created_at: 'integer', updated_at: 'integer' },
  assignment_rules: { id: 'text', strategy: 'text', manual_agent_id: 'text', is_active: 'integer', updated_by: 'text', updated_at: 'integer' },
  round_robin_state: { id: 'integer', last_assigned_agent_id: 'text', updated_at: 'integer' },
  webhook_log: { id: 'text', platform: 'text', received_at: 'integer', verified: 'integer', processing_status: 'text', error_message: 'text' },
  ai_request_log: { id: 'text', conversation_id: 'text', model_name: 'text', requested_at: 'integer', response_ms: 'integer', success: 'integer', error_message: 'text' },
}

describe('schema migration', () => {
  it('creates exactly the designed tables', () => {
    const rows = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
    expect(rows.map((r) => r.name).sort()).toEqual(Object.keys(expected).sort())
  })

  it.each(Object.entries(expected))('table %s has the designed columns and types', (table, cols) => {
    const info = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[]
    expect(Object.fromEntries(info.map((c) => [c.name, c.type.toLowerCase()]))).toEqual(cols)
  })

  it('rejects a duplicate (externalId, platform) on conversations', () => {
    const insert = () =>
      sqlite
        .prepare(
          "INSERT INTO conversations (id, external_id, platform, channel, status, created_at, updated_at) VALUES (?, 'ext-1', 'zaapi', 'whatsapp', 'open', 1, 1)",
        )
        .run(crypto.randomUUID())
    insert()
    expect(insert).toThrow(/UNIQUE/)
    // same externalId on another platform is allowed
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO conversations (id, external_id, platform, channel, status, created_at, updated_at) VALUES ('c2', 'ext-1', 'respond_io', 'whatsapp', 'open', 1, 1)",
        )
        .run(),
    ).not.toThrow()
  })

  it('rejects a duplicate (externalId, conversationId) on messages', () => {
    sqlite
      .prepare(
        "INSERT INTO conversations (id, external_id, platform, channel, status, created_at, updated_at) VALUES ('c1', 'e', 'zaapi', 'whatsapp', 'open', 1, 1)",
      )
      .run()
    const insert = () =>
      sqlite
        .prepare(
          "INSERT INTO messages (id, conversation_id, external_id, direction, body, status, created_at) VALUES (?, 'c1', 'm-1', 'inbound', 'hi', 'sent', 1)",
        )
        .run(crypto.randomUUID())
    insert()
    expect(insert).toThrow(/UNIQUE/)
  })
})
