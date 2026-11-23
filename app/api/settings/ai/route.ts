import { getSession } from '@/lib/auth/session'
import { aiSettingsView, parseAISettings, saveAISettings } from '@/lib/services/ai-settings'

async function denied(request: Request) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (session.role !== 'supervisor') return Response.json({ error: 'forbidden' }, { status: 403 })
  return null
}

export async function GET(request: Request) {
  return (await denied(request)) ?? Response.json(aiSettingsView())
}

export async function PUT(request: Request) {
  const deny = await denied(request)
  if (deny) return deny

  const parsed = parseAISettings(await request.json().catch(() => null))
  if (!parsed.ok) return Response.json({ error: 'invalid_body', field: parsed.field }, { status: 400 })
  saveAISettings(parsed.value)
  return Response.json(aiSettingsView())
}
