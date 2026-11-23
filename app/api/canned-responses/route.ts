import { getSession } from '@/lib/auth/session'
import { create, searchByPrefix } from '@/lib/services/canned-response'
import { parseInput } from './input'

export async function GET(request: Request) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })
  return Response.json(searchByPrefix(new URL(request.url).searchParams.get('prefix') ?? ''))
}

export async function POST(request: Request) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (session.role !== 'supervisor') return Response.json({ error: 'forbidden' }, { status: 403 })

  const input = await parseInput(request)
  if (!input) return Response.json({ error: 'invalid_body' }, { status: 400 })
  const result = create(input, session.userId)
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 })
  return Response.json(result.value, { status: 201 })
}
