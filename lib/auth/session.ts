import { jwtVerify, SignJWT } from 'jose'
import type { users } from '@/lib/db/schema'

export type Role = typeof users.$inferSelect['role']
export type Session = { userId: string; role: Role }

export const SESSION_COOKIE = 'session'
export const SESSION_TTL_SECONDS = 8 * 60 * 60

const ATTRS = 'Path=/; HttpOnly; SameSite=Lax'

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export function createSessionToken(userId: string, role: Role): Promise<string> {
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey())
}

export async function createSession(userId: string, role: Role): Promise<string> {
  const jwt = await createSessionToken(userId, role)
  return `${SESSION_COOKIE}=${jwt}; ${ATTRS}; Max-Age=${SESSION_TTL_SECONDS}`
}

export async function getSession(request: Request): Promise<Session | null> {
  const key = secretKey()
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    const { userId, role } = payload
    if (typeof userId !== 'string' || (role !== 'agent' && role !== 'supervisor')) return null
    return { userId, role }
  } catch {
    return null
  }
}

export function deleteSession(): string {
  return `${SESSION_COOKIE}=; ${ATTRS}; Max-Age=0`
}
