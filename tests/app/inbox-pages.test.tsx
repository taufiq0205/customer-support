import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/auth/session'
import { agent, db, insertConversation, messages, resetTables, setupDb, supervisor } from '../api/helpers'

let user: Session | null = supervisor
vi.mock('next/headers', () => ({
  headers: async () => new Headers(user ? { 'x-auth-user': JSON.stringify(user) } : {}),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))

const { default: AppLayout } = await import('@/app/(app)/layout')
const { default: InboxPage } = await import('@/app/(app)/inbox/page')
const { default: ThreadPage } = await import('@/app/(app)/inbox/[conversationId]/page')

const inbox = async (query: Record<string, string> = {}) =>
  renderToStaticMarkup(await InboxPage({ searchParams: Promise.resolve(query) }))
const thread = async (conversationId: string) =>
  renderToStaticMarkup(await ThreadPage({ params: Promise.resolve({ conversationId }) }))

let seq = 0
function insertMessage(conversationId: string, over: Partial<typeof messages.$inferInsert>) {
  const n = ++seq
  db.insert(messages)
    .values({
      id: `msg-${n}`,
      conversationId,
      externalId: `ext-msg-${n}`,
      direction: 'inbound',
      body: `synthetic body ${n}`,
      status: 'delivered',
      createdAt: n,
      ...over,
    })
    .run()
}

beforeAll(setupDb)
beforeEach(() => {
  resetTables()
  user = supervisor
})

describe('app layout', () => {
  it('shows the signed-in user and role', async () => {
    user = agent('agent-a')
    const html = renderToStaticMarkup(await AppLayout({ children: <p>child</p> }))
    expect(html).toContain('agent-a')
    expect(html).toContain('>agent<')
    expect(html).toContain('href="/inbox"')
    expect(html).toContain('<p>child</p>')
  })

  it('redirects to login without a trusted session header', async () => {
    user = null
    await expect(AppLayout({ children: null })).rejects.toThrow('REDIRECT:/login')
  })
})

describe('inbox page', () => {
  it('lists each conversation with name, platform, channel, preview, time and unread count', async () => {
    const read = insertConversation({ customerName: 'Synthetic Alice', platform: 'zaapi', channel: 'line', unreadCount: 0 })
    const unread = insertConversation({
      customerName: null,
      customerIdentifier: '+00 synthetic',
      platform: 'respond_io',
      channel: 'whatsapp',
      lastMessagePreview: 'where is my synthetic order',
      lastMessageAt: Date.UTC(2026, 10, 20, 9, 15),
      unreadCount: 3,
    })
    const html = await inbox()
    expect(html).toContain(`href="/inbox/${read.id}"`)
    expect(html).toContain(`href="/inbox/${unread.id}"`)
    expect(html).toContain('Synthetic Alice')
    expect(html).toContain('+00 synthetic')
    for (const label of ['Zaapi', 'LINE', 'respond.io', 'WhatsApp']) expect(html).toContain(`>${label}<`)
    expect(html).toContain('where is my synthetic order')
    expect(html).toContain('dateTime="2026-11-20T09:15:00.000Z"')
    expect(html).toContain('aria-label="3 unread"')
    expect(html.match(/ unread"/g)).toHaveLength(1)
  })

  it('applies URL filters, with assignedTo=me meaning the signed-in user', async () => {
    user = agent('agent-a')
    const mine = insertConversation({ assignedAgentId: 'agent-a', customerName: 'Mine' })
    insertConversation({ assignedAgentId: null, customerName: 'Free' })
    const html = await inbox({ assignedTo: 'me' })
    expect(html).toContain(`href="/inbox/${mine.id}"`)
    expect(html).not.toContain('Free')
  })

  it('ignores an invalid filter value instead of failing', async () => {
    insertConversation({ customerName: 'Still Listed' })
    expect(await inbox({ channel: 'fax' })).toContain('Still Listed')
  })

  it('shows an empty state when nothing matches', async () => {
    expect(await inbox()).toContain('No conversations')
  })
})

describe('thread page', () => {
  it('renders messages in chronological order with delivery status on outbound ones', async () => {
    const conv = insertConversation({ customerName: 'Synthetic Bob', channel: 'instagram' })
    insertMessage(conv.id, { body: 'third reply', direction: 'outbound', status: 'failed', sentAt: 3_000 })
    insertMessage(conv.id, { body: 'first question', sentAt: 1_000 })
    insertMessage(conv.id, { body: 'second reply', direction: 'outbound', status: 'unconfirmed', sentAt: 2_000 })
    insertMessage(conv.id, { body: 'fourth pending', direction: 'outbound', status: 'pending', sentAt: null })
    insertMessage(conv.id, { body: '', hasAttachment: 1, sentAt: 4_000 })

    const html = await thread(conv.id)
    expect(html).toContain('Synthetic Bob')
    expect(html).toContain('>Instagram<')
    expect(html).toContain('>Open<')
    const order = ['first question', 'second reply', 'third reply', 'Attachment', 'fourth pending'].map((t) => html.indexOf(t))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    for (const status of ['Unconfirmed', 'Failed', 'Pending']) expect(html).toContain(`>${status}<`)
    expect(html).not.toContain('>Delivered<') // inbound messages carry no delivery badge
  })

  it('shows the compose area and offers retry only on failed or unconfirmed outbound replies', async () => {
    const conv = insertConversation({})
    insertMessage(conv.id, { body: 'customer failed', status: 'failed' })
    insertMessage(conv.id, { body: 'reply failed', direction: 'outbound', status: 'failed' })
    insertMessage(conv.id, { body: 'reply unconfirmed', direction: 'outbound', status: 'unconfirmed' })
    insertMessage(conv.id, { body: 'reply pending', direction: 'outbound', status: 'pending' })
    insertMessage(conv.id, { body: 'reply sent', direction: 'outbound', status: 'sent' })

    const html = await thread(conv.id)
    expect(html).toMatch(/<textarea[^>]*aria-label="Reply"/)
    expect(html).toContain('>Send<')
    expect(html.match(/>Retry</g)).toHaveLength(1)
    expect(html.match(/>Resend</g)).toHaveLength(1)
    expect(html.indexOf('>Retry<')).toBeGreaterThan(html.indexOf('reply failed'))
    expect(html.indexOf('>Retry<')).toBeLessThan(html.indexOf('reply unconfirmed'))
    expect(html.indexOf('>Resend<')).toBeLessThan(html.indexOf('reply pending'))
  })

  it('returns not found for a conversation the agent cannot access', async () => {
    const other = insertConversation({ assignedAgentId: 'agent-b' })
    user = agent('agent-a')
    await expect(thread(other.id)).rejects.toThrow('NOT_FOUND')
    await expect(thread('missing')).rejects.toThrow('NOT_FOUND')
  })
})
