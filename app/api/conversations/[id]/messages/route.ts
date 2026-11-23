import { after } from 'next/server'
import { respondIoAdapter } from '@/lib/adapters/respond-io'
import { telegramAdapter } from '@/lib/adapters/telegram'
import type { Platform, PlatformAdapter } from '@/lib/adapters/types'
import { zaapiAdapter } from '@/lib/adapters/zaapi'
import { getSession } from '@/lib/auth/session'
import { findAccessible } from '@/lib/services/conversation'
import { deliverOutbound, findUnconfirmed, storeOutbound } from '@/lib/services/message'

const ADAPTERS: Record<Platform, PlatformAdapter> = { zaapi: zaapiAdapter, respond_io: respondIoAdapter, telegram: telegramAdapter }

const notFound = () => Response.json({ error: 'not_found' }, { status: 404 })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const json: unknown = await request.json().catch(() => null)
  const fields = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  const body = fields.body
  if (typeof body !== 'string' || body.trim() === '') return Response.json({ error: 'invalid_body' }, { status: 400 })

  const conversationId = (await params).id
  const conv = findAccessible(conversationId, session)
  if (!conv) return notFound()
  // The platform may already have delivered an unconfirmed copy; resending it must be an explicit choice.
  const unconfirmed = fields.confirmResend === true ? undefined : findUnconfirmed(conversationId, body)
  if (unconfirmed) return Response.json({ error: 'unconfirmed_duplicate', messageId: unconfirmed.id }, { status: 409 })
  const stored = storeOutbound(conversationId, body, session)
  if (!stored.ok) return notFound()

  const message = stored.value
  after(() =>
    deliverOutbound(message, { conversationId, externalConversationId: conv.externalId, body }, ADAPTERS[conv.platform]),
  )
  return Response.json(message, { status: 202 })
}
