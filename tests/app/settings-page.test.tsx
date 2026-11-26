import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/auth/session'
import { agent, db, setupDb, supervisor } from '../api/helpers'

let user: Session = supervisor
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-auth-user': JSON.stringify(user) }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))

const { default: SettingsPage } = await import('@/app/(app)/settings/page')
const { saveAISettingsAction, saveAutoAssignAction } = await import('@/app/(app)/settings/actions')
const { assignmentRules } = await import('@/lib/db/schema')
const { currentAutoAssignRule } = await import('@/lib/services/assignment')
const { readAIConfig } = await import('@/lib/adapters/ai')

beforeAll(setupDb)

let envPath: string
beforeEach(() => {
  user = supervisor
  db.delete(assignmentRules).run()
  envPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'settings-page-')), '.env.local')
  vi.stubEnv('AI_SETTINGS_ENV_PATH', envPath)
  vi.stubEnv('AI_ENDPOINT_URL', 'http://localhost:11434')
  vi.stubEnv('AI_MODEL_NAME', 'synthetic-model')
  vi.stubEnv('AI_API_KEY', 'synthetic-secret-key')
})
afterEach(() => vi.unstubAllEnvs())

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const initial = { endpointUrl: '', modelName: '', apiKeySet: false, saved: false }

describe('settings page', () => {
  it('sends agents back to the inbox', async () => {
    user = agent('agent-a')
    await expect(SettingsPage()).rejects.toThrow('REDIRECT:/inbox')
  })

  it('shows the current settings and masks the key', async () => {
    const html = renderToStaticMarkup(await SettingsPage())
    expect(html).toContain('value="http://localhost:11434"')
    expect(html).toContain('value="synthetic-model"')
    expect(html).toContain('type="password"')
    expect(html).toContain('A key is saved. Leave blank to keep it.')
    expect(html).not.toContain('synthetic-secret-key')
  })
})

describe('saveAISettingsAction', () => {
  it('re-checks the supervisor role', async () => {
    user = agent('agent-a')
    await expect(saveAISettingsAction(initial, form({ endpointUrl: '', modelName: '' }))).rejects.toThrow('REDIRECT:/inbox')
    expect(fs.existsSync(envPath)).toBe(false)
  })

  it('returns the invalid field and keeps what was typed', async () => {
    const state = await saveAISettingsAction(initial, form({ endpointUrl: 'ftp://ai.example.test', modelName: 'typed' }))
    expect(state).toEqual({ endpointUrl: 'ftp://ai.example.test', modelName: 'typed', apiKeySet: true, saved: false, field: 'endpointUrl' })
    expect(fs.existsSync(envPath)).toBe(false)
  })

  it('saves, keeps a blank key, and applies at once', async () => {
    const state = await saveAISettingsAction(initial, form({ endpointUrl: 'https://ai.example.test', modelName: 'new-model', apiKey: '' }))
    expect(state).toEqual({ endpointUrl: 'https://ai.example.test', modelName: 'new-model', apiKeySet: true, saved: true })
    expect(readAIConfig()).toEqual({ endpointUrl: 'https://ai.example.test', modelName: 'new-model', apiKey: 'synthetic-secret-key' })
  })
})

describe('saveAutoAssignAction', () => {
  it('rejects agents before changing the current rule', async () => {
    user = agent('agent-a')
    await expect(saveAutoAssignAction({ rule: undefined }, form({ strategy: 'round_robin' }))).rejects.toThrow('REDIRECT:/inbox')
    expect(currentAutoAssignRule()).toBeUndefined()
  })

  it('persists valid routing and preserves it when an invalid rule is submitted', async () => {
    const saved = await saveAutoAssignAction({ rule: undefined }, form({ strategy: 'manual', agentId: 'agent-a' }))
    expect(saved).toEqual({ rule: { strategy: 'manual', manualAgentId: 'agent-a' } })
    await expect(saveAutoAssignAction(saved, form({ strategy: 'manual', agentId: 'sup' })))
      .resolves.toEqual({ ...saved, error: 'Choose an active agent.' })
    await expect(saveAutoAssignAction(saved, form({ strategy: 'invalid' })))
      .resolves.toMatchObject({ rule: saved.rule, error: expect.stringMatching(/Choose a routing rule/) })
    expect(renderToStaticMarkup(await SettingsPage())).toContain('Current rule: agent-a')
    await expect(saveAutoAssignAction(saved, form({ strategy: 'round_robin' })))
      .resolves.toEqual({ rule: { strategy: 'round_robin', manualAgentId: null } })
    expect(currentAutoAssignRule()).toEqual({ strategy: 'round_robin', manualAgentId: null })
  })
})
