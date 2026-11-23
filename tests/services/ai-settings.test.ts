import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The AI adapter loads lib/db; keep it off the real database file.
process.env.DATABASE_URL = ':memory:'
const { readAIConfig } = await import('@/lib/adapters/ai')
const { aiSettingsView, parseAISettings, saveAISettings } = await import('@/lib/services/ai-settings')

let envPath: string
beforeEach(() => {
  envPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-settings-')), '.env.local')
  // Stubbing first makes unstubAllEnvs restore whatever saveAISettings writes.
  vi.stubEnv('AI_ENDPOINT_URL', '')
  vi.stubEnv('AI_MODEL_NAME', '')
  vi.stubEnv('AI_API_KEY', '')
})
afterEach(() => vi.unstubAllEnvs())

const input = { endpointUrl: 'http://localhost:11434', modelName: 'synthetic-model' }

describe('parseAISettings', () => {
  it('trims strings and treats a blank key as keep', () => {
    expect(parseAISettings({ endpointUrl: ' https://ai.example.test ', modelName: ' m ', apiKey: '  ' })).toEqual({
      ok: true,
      value: { endpointUrl: 'https://ai.example.test', modelName: 'm', apiKey: undefined },
    })
  })

  it('accepts an empty endpoint, which disables AI', () => {
    expect(parseAISettings({ endpointUrl: '', modelName: '' })).toEqual({ ok: true, value: { endpointUrl: '', modelName: '', apiKey: undefined } })
  })

  it.each([
    [null, 'body'],
    ['text', 'body'],
    [{ modelName: 'm' }, 'endpointUrl'],
    [{ endpointUrl: 'not a url', modelName: 'm' }, 'endpointUrl'],
    [{ endpointUrl: 'ftp://ai.example.test', modelName: 'm' }, 'endpointUrl'],
    [{ endpointUrl: 'http://ai.example.test', modelName: 'm\nSESSION_SECRET=x' }, 'modelName'],
    [{ endpointUrl: 'http://ai.example.test', modelName: 'm', apiKey: 'k\rX=1' }, 'apiKey'],
    [{ endpointUrl: 'http://ai.example.test', modelName: "m'" }, 'modelName'],
    [{ endpointUrl: 'http://ai.example.test', modelName: 7 }, 'modelName'],
  ])('rejects %j on %s', (raw, field) => {
    expect(parseAISettings(raw)).toEqual({ ok: false, field })
  })
})

describe('saveAISettings', () => {
  it('creates the file and applies the settings immediately', () => {
    saveAISettings({ ...input, apiKey: 'synthetic-key' }, envPath)
    expect(fs.readFileSync(envPath, 'utf8')).toBe(
      "AI_ENDPOINT_URL='http://localhost:11434'\nAI_MODEL_NAME='synthetic-model'\nAI_API_KEY='synthetic-key'\n",
    )
    expect(readAIConfig()).toEqual({ ...input, apiKey: 'synthetic-key' })
  })

  it('replaces AI lines in place and preserves every other line', () => {
    fs.writeFileSync(
      envPath,
      ['# comment', 'SESSION_SECRET=keep-me', 'export AI_ENDPOINT_URL=http://old.test', 'AI_MODEL_NAME=old', 'AI_MODEL_NAME=dupe', ''].join('\n'),
    )
    saveAISettings(input, envPath)
    expect(fs.readFileSync(envPath, 'utf8')).toBe(
      ['# comment', 'SESSION_SECRET=keep-me', "AI_ENDPOINT_URL='http://localhost:11434'", "AI_MODEL_NAME='synthetic-model'", ''].join('\n'),
    )
  })

  it('keeps the stored key when none is given', () => {
    fs.writeFileSync(envPath, 'AI_API_KEY=old-key\n')
    vi.stubEnv('AI_API_KEY', 'old-key')
    saveAISettings(input, envPath)
    expect(fs.readFileSync(envPath, 'utf8')).toContain('AI_API_KEY=old-key\n')
    expect(readAIConfig()?.apiKey).toBe('old-key')
  })

  it('escapes $ so Next.js does not expand it on reload', () => {
    saveAISettings({ ...input, apiKey: 'a$HOME' }, envPath)
    expect(fs.readFileSync(envPath, 'utf8')).toContain("AI_API_KEY='a\\$HOME'")
    expect(process.env.AI_API_KEY).toBe('a$HOME')
  })

  it('disables AI when the endpoint is cleared', () => {
    saveAISettings(input, envPath)
    saveAISettings({ endpointUrl: '', modelName: '' }, envPath)
    expect(readAIConfig()).toBeNull()
  })
})

describe('aiSettingsView', () => {
  it('reports whether a key is set without returning it', () => {
    const view = aiSettingsView({ NODE_ENV: 'test', AI_ENDPOINT_URL: 'http://localhost:11434', AI_MODEL_NAME: 'm', AI_API_KEY: 'synthetic-key' })
    expect(view).toEqual({ endpointUrl: 'http://localhost:11434', modelName: 'm', apiKeySet: true })
    expect(JSON.stringify(view)).not.toContain('synthetic-key')
  })
})
