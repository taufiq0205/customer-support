import { getSession } from '@/lib/auth/session'
import { getConversation } from '@/lib/services/conversation'

// Another agent's conversation is reported as not_found, so its existence does not leak.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const result = getConversation((await params).id, session)
  if (!result.ok) return Response.json({ error: 'not_found' }, { status: 404 })
  return Response.json(result.value)
}
