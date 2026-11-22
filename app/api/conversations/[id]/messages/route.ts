import { after } from 'next/server'
import { respondIoAdapter } from '@/lib/adapters/respond-io'
import type { Platform, PlatformAdapter } from '@/lib/adapters/types'
import { zaapiAdapter } from '@/lib/adapters/zaapi'
import { getSession } from '@/lib/auth/session'
import { findAccessible } from '@/lib/services/conversation'
import { deliverOutbound, storeOutbound } from '@/lib/services/message'

const ADAPTERS: Record<Platform, PlatformAdapter> = { zaapi: zaapiAdapter, respond_io: respondIoAdapter }

const notFound = () => Response.json({ error: 'not_found' }, { status: 404 })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const json: unknown = await request.json().catch(() => null)
  const body = typeof json === 'object' && json !== null ? (json as Record<string, unknown>).body : undefined
  if (typeof body !== 'string' || body.trim() === '') return Response.json({ error: 'invalid_body' }, { status: 400 })

  const conversationId = (await params).id
  const conv = findAccessible(conversationId, session)
  if (!conv) return notFound()
  const stored = storeOutbound(conversationId, body, session)
  if (!stored.ok) return notFound()

  const message = stored.value
  after(() =>
    deliverOutbound(message, { conversationId, externalConversationId: conv.externalId, body }, ADAPTERS[conv.platform]),
  )
  return Response.json(message, { status: 202 })
}
