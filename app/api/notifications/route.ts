import { and, desc, eq, inArray } from 'drizzle-orm'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { notifications } from '@/lib/db/schema'

export async function GET(request: Request) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const unread = db
    .select({ id: notifications.id, conversationId: notifications.conversationId, type: notifications.type, createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.userId, session.userId), eq(notifications.isRead, 0)))
    .orderBy(desc(notifications.createdAt))
    .all()
  return Response.json(unread)
}

export async function PATCH(request: Request) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  const ids = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).ids : undefined
  if (ids !== 'all' && !(Array.isArray(ids) && ids.every((id) => typeof id === 'string'))) {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { changes } = db
    .update(notifications)
    .set({ isRead: 1 })
    .where(
      and(
        eq(notifications.userId, session.userId),
        eq(notifications.isRead, 0),
        ids === 'all' ? undefined : inArray(notifications.id, ids),
      ),
    )
    .run()
  return Response.json({ updated: changes })
}
