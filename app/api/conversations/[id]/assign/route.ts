import { getSession } from '@/lib/auth/session'
import { assign, type AssignResult } from '@/lib/services/assignment'

const HTTP_STATUS: Record<Extract<AssignResult, { ok: false }>['error'], number> = {
  not_found: 404,
  forbidden: 403,
  invalid_agent: 400,
  resolved: 409,
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  const agentId = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).agentId : undefined
  if (typeof agentId !== 'string' || !agentId) return Response.json({ error: 'invalid_body' }, { status: 400 })

  const result = assign((await params).id, agentId, session)
  if (!result.ok) return Response.json({ error: result.error }, { status: HTTP_STATUS[result.error] })
  return Response.json(result.value)
}
