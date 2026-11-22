import { vi } from 'vitest'
import type { Session } from '@/lib/auth/session'

// Must run before lib/db loads; test files import this module first.
process.env.DATABASE_URL = ':memory:'

export const { db, runMigrations } = await import('@/lib/db')
export const { users, conversations, conversationHistory, messages, aiRequestLog, notifications } = await import('@/lib/db/schema')
const { createSessionToken, SESSION_COOKIE } = await import('@/lib/auth/session')
const listRoute = await import('@/app/api/conversations/route')
const detailRoute = await import('@/app/api/conversations/[id]/route')
const statusRoute = await import('@/app/api/conversations/[id]/status/route')
const messagesRoute = await import('@/app/api/conversations/[id]/messages/route')
const suggestRoute = await import('@/app/api/conversations/[id]/ai-suggest/route')
const assignRoute = await import('@/app/api/conversations/[id]/assign/route')

export type ConvRow = typeof conversations.$inferInsert

export const supervisor: Session = { userId: 'sup', role: 'supervisor' }
export const AGENTS = ['agent-a', 'agent-b', 'agent-c'] as const
export const agent = (userId: string): Session => ({ userId, role: 'agent' })

export function setupDb() {
  vi.stubEnv('SESSION_SECRET', 'synthetic-session-secret')
  runMigrations()
  db.insert(users)
    .values(
      ['sup', ...AGENTS].map((id) => ({
        id,
        username: id,
        passwordHash: 'x',
        displayName: id,
        role: id === 'sup' ? ('supervisor' as const) : ('agent' as const),
        createdAt: 0,
      })),
    )
    .run()
}

export function resetTables() {
  db.delete(conversationHistory).run()
  db.delete(messages).run()
  db.delete(aiRequestLog).run()
  db.delete(notifications).run()
  db.delete(conversations).run()
}

let seq = 0
export function insertConversation(over: Partial<ConvRow> = {}): ConvRow {
  const n = ++seq
  const row: ConvRow = {
    id: `conv-${n}`,
    externalId: `ext-${n}`,
    platform: 'zaapi',
    channel: 'whatsapp',
    customerName: 'Synthetic Customer',
    lastMessageAt: 1_000 + n,
    lastMessagePreview: 'synthetic preview',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
  db.insert(conversations).values(row).run()
  return row
}

const BASE = 'http://127.0.0.1/api/conversations'

async function headers(session: Session | null): Promise<HeadersInit> {
  return session ? { cookie: `${SESSION_COOKIE}=${await createSessionToken(session.userId, session.role)}` } : {}
}

export async function list(session: Session | null, query = '') {
  return listRoute.GET(new Request(`${BASE}${query}`, { headers: await headers(session) }))
}

export async function detail(session: Session | null, id: string) {
  return detailRoute.GET(new Request(`${BASE}/${id}`, { headers: await headers(session) }), {
    params: Promise.resolve({ id }),
  })
}

export async function patchStatus(session: Session | null, id: string, body: string) {
  return statusRoute.PATCH(
    new Request(`${BASE}/${id}/status`, { method: 'PATCH', body, headers: await headers(session) }),
    { params: Promise.resolve({ id }) },
  )
}

export async function postMessage(session: Session | null, id: string, body: string) {
  return messagesRoute.POST(
    new Request(`${BASE}/${id}/messages`, { method: 'POST', body, headers: await headers(session) }),
    { params: Promise.resolve({ id }) },
  )
}

export async function postSuggest(session: Session | null, id: string) {
  return suggestRoute.POST(new Request(`${BASE}/${id}/ai-suggest`, { method: 'POST', headers: await headers(session) }), {
    params: Promise.resolve({ id }),
  })
}

export async function postAssign(session: Session | null, id: string, body: string) {
  return assignRoute.POST(
    new Request(`${BASE}/${id}/assign`, { method: 'POST', body, headers: await headers(session) }),
    { params: Promise.resolve({ id }) },
  )
}
