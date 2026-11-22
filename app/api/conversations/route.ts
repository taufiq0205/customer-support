import { getSession } from '@/lib/auth/session'
import { getConversations, parseConversationQuery } from '@/lib/services/conversation'

export async function GET(request: Request) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { filters, invalidField } = parseConversationQuery(new URL(request.url).searchParams, session)
  if (invalidField) return Response.json({ error: 'invalid_query', field: invalidField }, { status: 400 })
  return Response.json(getConversations(filters, session))
}
