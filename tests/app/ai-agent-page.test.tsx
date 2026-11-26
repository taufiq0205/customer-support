import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/auth/session'

let session: Session | null
vi.mock('next/headers', () => ({
  headers: async () => new Headers(session ? { 'x-auth-user': JSON.stringify(session) } : {}),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

const { default: AiAgentPage } = await import('@/app/(app)/ai-agent/page')

const workspace = async (query: Record<string, string | string[]> = {}) =>
  renderToStaticMarkup(await AiAgentPage({ searchParams: Promise.resolve(query) }))

beforeEach(() => {
  session = { role: 'supervisor', userId: 'synthetic-supervisor' }
})

describe('AI Agent workspace', () => {
  it('redirects unauthenticated visitors and agents before rendering a deep link', async () => {
    session = null
    await expect(workspace({ tab: 'drift' })).rejects.toThrow('REDIRECT:/login')
    session = { role: 'agent', userId: 'synthetic-agent' }
    await expect(workspace({ tab: 'drift' })).rejects.toThrow('REDIRECT:/inbox')
  })

  it.each([
    ['overview', 'AI messages sent'],
    ['agent_config', 'Pause'],
    ['knowledge_base', 'Retrieval preview'],
    ['knowledge_gaps', 'Handoff reason'],
    ['sentiment', 'Unknown'],
    ['drift', 'Sample size'],
  ])('renders the %s deep link with unavailable data', async (tab, content) => {
    const html = await workspace({ tab })
    expect(html.toLowerCase()).toContain(content.toLowerCase())
    expect(html).toContain('Not connected')
  })

  it('falls back to Overview for multiple tab values', async () => {
    const html = await workspace({ tab: ['drift', 'knowledge_base'] })
    expect(html.toLowerCase()).toContain('ai messages sent')
  })

  it('shows the details for the selected gap category and drift signal', async () => {
    const gaps = await workspace({ tab: 'knowledge_gaps', category: 'shipping' })
    expect(gaps).toContain('Selected category: Shipping')
    const drift = await workspace({ tab: 'drift', signal: 'model-version' })
    expect(drift).toContain('Selected detail: Model version')
  })
})
