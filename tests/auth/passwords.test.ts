import { beforeAll, describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/auth/passwords'

// Cost-12 hashes take ~1s each; hash once so the suite stays under the default timeout on a busy machine.
let hash: string
beforeAll(async () => {
  hash = await hashPassword('synthetic-pass-1')
}, 20_000)

describe('passwords', () => {
  it('verifies the original password against its hash', async () => {
    expect(await verifyPassword('synthetic-pass-1', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    expect(await verifyPassword('synthetic-pass-2', hash)).toBe(false)
  })

  it('hashes with bcrypt cost 12', () => {
    expect(hash).toMatch(/^\$2[ab]\$12\$/)
  })

  it('produces different hashes for the same input', async () => {
    expect(await hashPassword('synthetic-pass-1')).not.toBe(hash)
  })
})
