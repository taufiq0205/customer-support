import { getSession } from '@/lib/auth/session'
import { getMetrics, parseReportQuery } from '@/lib/services/report'

export async function GET(request: Request) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (session.role !== 'supervisor') return Response.json({ error: 'forbidden' }, { status: 403 })

  const { from, to, filters, invalidField } = parseReportQuery(new URL(request.url).searchParams)
  if (invalidField) return Response.json({ error: 'invalid_query', field: invalidField }, { status: 400 })
  return Response.json(getMetrics(from, to, filters))
}
