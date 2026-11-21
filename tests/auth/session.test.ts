import { SignJWT } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession, deleteSession, getSession } from '@/lib/auth/session'

const req = (cookie?: string) => new Request('http://127.0.0.1/', cookie ? { headers: { cookie } } : undefined)
const pair = (setCookie: string) => setCookie.split(';')[0]

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret'
})
afterEach(() => vi.useRealTimers())

describe('session', () => {
  it('round-trips userId and role', async () => {
    const cookie = pair(await createSession('user-1', 'supervisor'))
    expect(await getSession(req(cookie))).toEqual({ userId: 'user-1', role: 'supervisor' })
  })

  it('sets HttpOnly, SameSite=Lax and Max-Age=28800', async () => {
    const header = await createSession('user-1', 'agent')
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Max-Age=28800')
  })

  it('rejects an expired token', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const cookie = pair(await createSession('user-1', 'agent'))
    vi.setSystemTime(new Date('2026-01-01T08:00:01Z'))
    expect(await getSession(req(cookie))).toBeNull()
  })

  it('rejects a tampered token', async () => {
    const cookie = pair(await createSession('user-1', 'agent'))
    const flipped = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A')
    expect(await getSession(req(flipped))).toBeNull()
  })

  it('rejects a token signed with another secret', async () => {
    const cookie = pair(await createSession('user-1', 'agent'))
    process.env.SESSION_SECRET = 'a-different-secret-a-different-secret'
    expect(await getSession(req(cookie))).toBeNull()
  })

  it('rejects a token with an invalid role', async () => {
    const jwt = await new SignJWT({ userId: 'user-1', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET))
    expect(await getSession(req(`session=${jwt}`))).toBeNull()
  })

  it('returns null without a cookie', async () => {
    expect(await getSession(req())).toBeNull()
  })

  it('throws when SESSION_SECRET is missing', async () => {
    delete process.env.SESSION_SECRET
    await expect(createSession('user-1', 'agent')).rejects.toThrow('SESSION_SECRET')
  })

  it('deleteSession expires the cookie', () => {
    expect(deleteSession()).toContain('Max-Age=0')
  })
})
