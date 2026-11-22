import { getSession } from '@/lib/auth/session'
import { changeStatus, TRANSITIONS, type Result, type Status } from '@/lib/services/conversation'

const STATUSES = Object.keys(TRANSITIONS)

const HTTP_STATUS: Record<Extract<Result<unknown>, { ok: false }>['error'], number> = {
  not_found: 404,
  invalid_transition: 409,
  snooze_time_required: 400,
}

const invalidBody = () => Response.json({ error: 'invalid_body' }, { status: 400 })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null) return invalidBody()
  const { toStatus, reason, snoozedUntil } = body as Record<string, unknown>
  if (
    typeof toStatus !== 'string' ||
    !STATUSES.includes(toStatus) ||
    (reason !== undefined && typeof reason !== 'string') ||
    (snoozedUntil !== undefined && !Number.isFinite(snoozedUntil))
  ) {
    return invalidBody()
  }

  const result = changeStatus(
    (await params).id,
    toStatus as Status,
    session,
    reason as string | undefined,
    snoozedUntil as number | undefined,
  )
  if (!result.ok) return Response.json({ error: result.error }, { status: HTTP_STATUS[result.error] })
  return Response.json(result.value)
}
