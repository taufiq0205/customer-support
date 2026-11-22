import { beforeEach, describe, expect, it, vi } from 'vitest'

const set = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))
const authenticate = vi.fn()
vi.mock('@/lib/auth/login', () => ({ authenticate: (...a: unknown[]) => authenticate(...a) }))

import { login } from '@/app/(auth)/login/actions'
import { getSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth/session'

function form(username: string, password: string) {
  const f = new FormData()
  f.set('username', username)
  f.set('password', password)
  return f
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-at-least-32-bytes-long!!'
  set.mockReset()
  authenticate.mockReset()
})

describe('login action', () => {
  it('sets a verifiable session cookie and redirects home on valid credentials', async () => {
    authenticate.mockResolvedValue({ userId: 'u1', role: 'agent' })
    await expect(login({ error: '' }, form('alice', 'pw'))).rejects.toThrow('REDIRECT:/')
    expect(set).toHaveBeenCalledOnce()
    const [name, token, opts] = set.mock.calls[0]
    expect(name).toBe(SESSION_COOKIE)
    expect(opts).toEqual({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_SECONDS })
    const req = new Request('http://x', { headers: { cookie: `${SESSION_COOKIE}=${token}` } })
    expect(await getSession(req)).toEqual({ userId: 'u1', role: 'agent' })
  })

  it('returns the generic error for bad credentials without setting a cookie', async () => {
    authenticate.mockResolvedValue(null)
    expect(await login({ error: '' }, form('alice', 'wrong'))).toEqual({ error: 'Invalid username or password' })
    expect(set).not.toHaveBeenCalled()
  })

  it('returns the generic error for empty fields without calling authenticate', async () => {
    expect(await login({ error: '' }, form('', ''))).toEqual({ error: 'Invalid username or password' })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('hides internal errors behind a generic message', async () => {
    authenticate.mockRejectedValue(new Error('db exploded at /secret/path'))
    const state = await login({ error: '' }, form('alice', 'pw'))
    expect(state.error).not.toMatch(/db|secret/)
    expect(set).not.toHaveBeenCalled()
  })
})
