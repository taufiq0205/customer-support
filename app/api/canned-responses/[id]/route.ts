import { getSession } from '@/lib/auth/session'
import { remove, update } from '@/lib/services/canned-response'
import { parseInput } from '../input'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (session.role !== 'supervisor') return Response.json({ error: 'forbidden' }, { status: 403 })

  const input = await parseInput(request)
  if (!input) return Response.json({ error: 'invalid_body' }, { status: 400 })
  const result = update((await params).id, input)
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === 'not_found' ? 404 : 409 })
  return Response.json(result.value)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (session.role !== 'supervisor') return Response.json({ error: 'forbidden' }, { status: 403 })

  if (!remove((await params).id)) return Response.json({ error: 'not_found' }, { status: 404 })
  return new Response(null, { status: 204 })
}
