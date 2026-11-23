import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { agent, getAISettings, putAISettings, setupDb, supervisor } from './helpers'

let envPath: string
beforeAll(setupDb)
beforeEach(() => {
  envPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-settings-route-')), '.env.local')
  // Keeps the route off the repo's real .env.local.
  vi.stubEnv('AI_SETTINGS_ENV_PATH', envPath)
  vi.stubEnv('SESSION_SECRET', 'synthetic-session-secret')
  vi.stubEnv('AI_ENDPOINT_URL', 'http://localhost:11434')
  vi.stubEnv('AI_MODEL_NAME', 'synthetic-model')
  vi.stubEnv('AI_API_KEY', 'synthetic-secret-key')
})
afterEach(() => vi.unstubAllEnvs())

// After helpers, which point lib/db at :memory: before anything loads it.
const { readAIConfig } = await import('@/lib/adapters/ai')

const body = (value: unknown) => JSON.stringify(value)

describe('/api/settings/ai', () => {
  it('requires a session', async () => {
    expect((await getAISettings(null)).status).toBe(401)
    expect((await putAISettings(null, body({}))).status).toBe(401)
  })

  it('is supervisor-only for reads and writes', async () => {
    for (const res of [await getAISettings(agent('agent-a')), await putAISettings(agent('agent-a'), body({ endpointUrl: '', modelName: '' }))]) {
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden' })
    }
    expect(fs.existsSync(envPath)).toBe(false)
  })

  it('returns the settings without the API key', async () => {
    const res = await getAISettings(supervisor)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ endpointUrl: 'http://localhost:11434', modelName: 'synthetic-model', apiKeySet: true })
    expect(text).not.toContain('synthetic-secret-key')
  })

  it.each([
    ['{not json', 'body'],
    [body({ endpointUrl: 'javascript:alert(1)', modelName: 'm' }), 'endpointUrl'],
    [body({ endpointUrl: 'http://ai.example.test', modelName: 'm\nX=1' }), 'modelName'],
  ])('rejects %s', async (raw, field) => {
    const res = await putAISettings(supervisor, raw)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body', field })
    expect(fs.existsSync(envPath)).toBe(false)
  })

  it('saves and applies the new settings without a restart', async () => {
    const res = await putAISettings(supervisor, body({ endpointUrl: 'https://ai.example.test', modelName: 'new-model', apiKey: 'new-key' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ endpointUrl: 'https://ai.example.test', modelName: 'new-model', apiKeySet: true })
    expect(readAIConfig()).toEqual({ endpointUrl: 'https://ai.example.test', modelName: 'new-model', apiKey: 'new-key' })
    expect(fs.readFileSync(envPath, 'utf8')).toContain("AI_API_KEY='new-key'")
  })
})
