import { authenticate } from '@/lib/auth/login'
import { createSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid request' }, { status: 400 })
  }
  const { username, password } = (body ?? {}) as Record<string, unknown>
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return Response.json({ error: 'invalid request' }, { status: 400 })
  }

  const session = await authenticate(username, password)
  if (!session) return Response.json({ error: 'invalid credentials' }, { status: 401 })

  return Response.json(session, {
    headers: { 'Set-Cookie': await createSession(session.userId, session.role) },
  })
}
