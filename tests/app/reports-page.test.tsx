import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/auth/session'
import { agent, insertConversation, resetTables, setupDb, supervisor } from '../api/helpers'

let user: Session = supervisor
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-auth-user': JSON.stringify(user) }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))

const { default: ReportsPage } = await import('@/app/(app)/reports/page')
const { formatDuration } = await import('@/app/(app)/inbox/labels')
const { defaultRange } = await import('@/lib/services/report')

const reports = async (query: Record<string, string> = {}) =>
  renderToStaticMarkup(await ReportsPage({ searchParams: Promise.resolve(query) }))

beforeAll(setupDb)
beforeEach(() => {
  resetTables()
  user = supervisor
})

describe('reports page', () => {
  it('sends agents back to the inbox', async () => {
    user = agent('agent-a')
    await expect(reports()).rejects.toThrow('REDIRECT:/inbox')
  })

  it('labels agent rows by name and flags low volume', async () => {
    const createdAt = Date.parse('2026-11-23T10:00:00+08:00')
    insertConversation({ createdAt, assignedAgentId: 'agent-b', status: 'resolved' })
    insertConversation({ createdAt, channel: 'line' })
    const html = await reports({ from: '2026-11-23', to: '2026-11-23' })
    expect(html).toContain('>agent-b<')
    expect(html).toContain('>Unassigned<')
    expect(html).toContain('>LINE<')
    expect(html).toContain('Low volume')
  })

  it('falls back to the default week for an invalid range instead of failing', async () => {
    const html = await reports({ from: 'not-a-date', channel: 'fax' })
    expect(html).toContain(`value="${defaultRange().from}"`)
    expect(html).toContain(`value="${defaultRange().to}"`)
  })
})

describe('formatDuration', () => {
  it.each([
    [null, '—'],
    [45_000, '45s'],
    [245_000, '4m 5s'],
    [3_660_000, '1h 1m'],
    [2 * 86_400_000 + 3 * 3_600_000, '2d 3h'],
  ])('formats %s as %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })
})
