import fs from 'node:fs'
import path from 'node:path'
import { readAIConfig } from '@/lib/adapters/ai'

export type AISettingsInput = { endpointUrl: string; modelName: string; apiKey?: string }

const KEYS = { endpointUrl: 'AI_ENDPOINT_URL', modelName: 'AI_MODEL_NAME', apiKey: 'AI_API_KEY' } as const

export function parseAISettings(raw: unknown): { ok: true; value: AISettingsInput } | { ok: false; field: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, field: 'body' }
  const r = raw as Record<string, unknown>
  const value: Record<string, string> = {}
  for (const field of Object.keys(KEYS)) {
    const v = field === 'apiKey' ? (r[field] ?? '') : r[field]
    // Line breaks would inject extra env lines; a single quote would end the quoted value early.
    if (typeof v !== 'string' || /[\r\n']/.test(v)) return { ok: false, field }
    value[field] = v.trim()
  }
  const { endpointUrl, modelName, apiKey } = value
  if (endpointUrl && !/^https?:$/.test(URL.parse(endpointUrl)?.protocol ?? '')) return { ok: false, field: 'endpointUrl' }
  return { ok: true, value: { endpointUrl, modelName, apiKey: apiKey || undefined } }
}

// Writes the AI keys into the env file Next.js loads at boot, and into process.env so the change applies now.
export function saveAISettings(
  input: AISettingsInput,
  envPath = process.env.AI_SETTINGS_ENV_PATH || path.join(process.cwd(), '.env.local'),
) {
  const updates: [string, string][] = [
    [KEYS.endpointUrl, input.endpointUrl],
    [KEYS.modelName, input.modelName],
  ]
  if (input.apiKey) updates.push([KEYS.apiKey, input.apiKey])

  const text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  let lines = text ? text.replace(/\n$/, '').split('\n') : []
  for (const [key, value] of updates) {
    const isKey = (line: string) => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line)
    const at = lines.findIndex(isKey)
    lines = lines.filter((line) => !isKey(line))
    // Next.js expands $VAR in env files; \$ keeps a literal dollar sign.
    lines.splice(at === -1 ? lines.length : at, 0, `${key}='${value.replaceAll('$', '\\$')}'`)
  }
  // Write then rename so a failed write never truncates the other secrets in the file.
  const tmp = `${envPath}.tmp`
  fs.writeFileSync(tmp, `${lines.join('\n')}\n`, { mode: 0o600 })
  fs.renameSync(tmp, envPath)

  for (const [key, value] of updates) process.env[key] = value
}

// Never returns the API key itself; clients only learn whether one is stored.
export function aiSettingsView(env = process.env): { endpointUrl: string; modelName: string; apiKeySet: boolean } {
  const config = readAIConfig(env)
  return { endpointUrl: config?.endpointUrl ?? '', modelName: config?.modelName ?? '', apiKeySet: Boolean(config?.apiKey) }
}
