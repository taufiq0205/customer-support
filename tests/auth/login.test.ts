import { beforeAll, describe, expect, it } from 'vitest'

process.env.DATABASE_URL = ':memory:'
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret'

const { db, runMigrations } = await import('@/lib/db')
const { users } = await import('@/lib/db/schema')
const { hashPassword } = await import('@/lib/auth/passwords')
const { getSession } = await import('@/lib/auth/session')
const { authenticate } = await import('@/lib/auth/login')
const login = await import('@/app/api/auth/login/route')
const logout = await import('@/app/api/auth/logout/route')

const post = (body: string) =>
  login.POST(new Request('http://127.0.0.1/api/auth/login', { method: 'POST', body }))

beforeAll(async () => {
  runMigrations()
  const passwordHash = await hashPassword('correct-horse')
  db.insert(users)
    .values([
      { id: 'u-active', username: 'agent.one', passwordHash, displayName: 'Agent One', role: 'agent', createdAt: 0 },
      { id: 'u-off', username: 'agent.off', passwordHash, displayName: 'Agent Off', role: 'agent', createdAt: 0, isActive: 0 },
    ])
    .run()
})

describe('authenticate', () => {
  it('returns the session for valid credentials', async () => {
    expect(await authenticate('agent.one', 'correct-horse')).toEqual({ userId: 'u-active', role: 'agent' })
  })

  it('rejects a wrong password', async () => {
    expect(await authenticate('agent.one', 'wrong')).toBeNull()
  })

  it('rejects an unknown user', async () => {
    expect(await authenticate('nobody', 'correct-horse')).toBeNull()
  })

  it('rejects an inactive user', async () => {
    expect(await authenticate('agent.off', 'correct-horse')).toBeNull()
  })
})

describe('POST /api/auth/login', () => {
  it('returns 200 with the session and a working cookie', async () => {
    const res = await post(JSON.stringify({ username: 'agent.one', password: 'correct-horse' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId: 'u-active', role: 'agent' })
    const cookie = res.headers.get('set-cookie')!.split(';')[0]
    const session = await getSession(new Request('http://127.0.0.1/', { headers: { cookie } }))
    expect(session).toEqual({ userId: 'u-active', role: 'agent' })
  })

  it('returns 401 for bad credentials without echoing the password', async () => {
    const res = await post(JSON.stringify({ username: 'agent.one', password: 'secret-guess' }))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ error: 'invalid credentials' })
    expect(text).not.toContain('secret-guess')
  })

  it.each(['not json', 'null', '"str"', '{}', '{"username":"agent.one","password":""}', '{"username":1,"password":"x"}'])(
    'returns 400 for %s',
    async (body) => {
      expect((await post(body)).status).toBe(400)
    },
  )
})

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = logout.POST()
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/^session=;.*Max-Age=0/)
  })
})
