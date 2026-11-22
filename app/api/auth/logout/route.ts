import { deleteSession } from '@/lib/auth/session'

export function POST() {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': deleteSession() } })
}
