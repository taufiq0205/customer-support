import { aiAdapter, readAIConfig } from '@/lib/adapters/ai'
import { getSession } from '@/lib/auth/session'
import { getConversation } from '@/lib/services/conversation'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const config = readAIConfig()
  if (!config) return Response.json({ error: 'ai_not_configured' }, { status: 404 })

  const conversationId = (await params).id
  const result = getConversation(conversationId, session)
  if (!result.ok) return Response.json({ error: 'not_found' }, { status: 404 })

  const { conversation, messages } = result.value
  const outcome = await aiAdapter.suggest({
    ...config,
    conversationId,
    thread: messages.flatMap((m) =>
      !m.body ? [] : [{ role: m.direction === 'inbound' ? ('customer' as const) : ('agent' as const), content: m.body }],
    ),
    customerNames: conversation.customerName ? [conversation.customerName] : [],
  })
  return Response.json(outcome, { status: outcome.suggestion === null ? 502 : 200 })
}
