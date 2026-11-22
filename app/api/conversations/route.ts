import { CHANNELS, PLATFORMS } from '@/lib/adapters/types'
import { getSession } from '@/lib/auth/session'
import { getConversations, TRANSITIONS, type ConversationFilters } from '@/lib/services/conversation'

const ENUM_PARAMS: Record<'status' | 'platform' | 'channel', readonly string[]> = {
  status: Object.keys(TRANSITIONS),
  platform: PLATFORMS,
  channel: CHANNELS,
}

export async function GET(request: Request) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const query = new URL(request.url).searchParams
  const filters: ConversationFilters = {
    search: query.get('search') ?? undefined,
    cursor: query.get('page') ?? undefined,
  }
  for (const [field, allowed] of Object.entries(ENUM_PARAMS)) {
    const value = query.get(field)
    if (value === null) continue
    if (!allowed.includes(value)) return Response.json({ error: 'invalid_query', field }, { status: 400 })
    Object.assign(filters, { [field]: value })
  }
  const assignedTo = query.get('assignedTo')
  if (assignedTo) filters.assignedAgentId = assignedTo === 'unassigned' ? null : assignedTo

  return Response.json(getConversations(filters, session))
}
