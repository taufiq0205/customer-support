import { beforeAll, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

let seedUser: typeof import('../../scripts/seed-users').seedUser
let dbMod: typeof import('../../lib/db')
let schema: typeof import('../../lib/db/schema')

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-users-'))
  process.env.DATABASE_URL = path.join(dir, 'test.db')
  ;({ seedUser } = await import('../../scripts/seed-users'))
  dbMod = await import('../../lib/db')
  schema = await import('../../lib/db/schema')
})

describe('seedUser', () => {
  it('creates a user with a bcrypt hash, not the plaintext', async () => {
    await seedUser({ username: 'alice', password: 'synthetic-pw', role: 'agent' })
    const row = dbMod.db.select().from(schema.users).all().find((u) => u.username === 'alice')!
    expect(row.passwordHash).not.toBe('synthetic-pw')
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/)
    expect(row.displayName).toBe('alice')
    expect(row.role).toBe('agent')
  })

  it('rejects a duplicate username', async () => {
    await seedUser({ username: 'bob', password: 'synthetic-pw', role: 'supervisor' })
    await expect(seedUser({ username: 'bob', password: 'x', role: 'agent' })).rejects.toThrow(/already exists/)
  })

  it('rejects an invalid role', async () => {
    await expect(seedUser({ username: 'carol', password: 'x', role: 'admin' })).rejects.toThrow(/invalid role/)
  })
})
