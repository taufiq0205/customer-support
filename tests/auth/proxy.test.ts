import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'
import { createSession } from '@/lib/auth/session'

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://127.0.0.1${path}`, { headers })

const validCookie = async () => (await createSession('u-1', 'agent')).split(';')[0]

const forwarded = (res: Response, name: string) =>
  res.headers.get(`x-middleware-request-${name}`)

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-0123'
})

describe('proxy', () => {
  it('redirects unauthenticated page requests to /login', async () => {
    const res = await proxy(req('/inbox'))
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })

  it('returns 401 for unauthenticated API requests', async () => {
    const res = await proxy(req('/api/x'))
    expect(res.status).toBe(401)
  })

  it.each(['/login', '/api/auth/login'])('passes %s through unauthenticated', async (path) => {
    const res = await proxy(req(path))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('forwards the session as x-auth-user and refreshes the cookie', async () => {
    const res = await proxy(req('/inbox', { cookie: await validCookie() }))
    expect(res.status).toBe(200)
    expect(JSON.parse(forwarded(res, 'x-auth-user')!)).toEqual({ userId: 'u-1', role: 'agent' })
    expect(res.headers.get('set-cookie')).toContain('session=')
  })

  it('overwrites a spoofed x-auth-user when authenticated', async () => {
    const spoof = JSON.stringify({ userId: 'evil', role: 'supervisor' })
    const res = await proxy(req('/inbox', { cookie: await validCookie(), 'x-auth-user': spoof }))
    expect(JSON.parse(forwarded(res, 'x-auth-user')!)).toEqual({ userId: 'u-1', role: 'agent' })
  })

  it('does not forward a spoofed x-auth-user without a session', async () => {
    const spoof = JSON.stringify({ userId: 'evil', role: 'supervisor' })
    const res = await proxy(req('/login', { 'x-auth-user': spoof }))
    expect(forwarded(res, 'x-auth-user')).toBeNull()
  })
})
