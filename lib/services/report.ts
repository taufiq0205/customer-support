import { and, gte, lt, sql } from 'drizzle-orm'
import { CHANNELS, PLATFORMS, type Channel, type Platform } from '@/lib/adapters/types'
import { db } from '@/lib/db'
import { conversationHistory, conversations, messages } from '@/lib/db/schema'
import { wakeExpiredSnoozes } from './conversation'

export type ReportFilters = { agentId?: string; channel?: Channel; platform?: Platform }
export type Metrics = {
  received: number
  resolved: number
  avgFirstResponseMs: number | null
  avgResolutionMs: number | null
  lowVolume: boolean
}
export type BreakdownRow = Metrics & { key: string }
export type Report = {
  range: { from: string; to: string }
  summary: { open: number; queue: number; snoozed: number }
  totals: Metrics
  breakdown: Record<keyof typeof GROUPS, BreakdownRow[]>
}

const DAY_MS = 86_400_000
// Malaysia is UTC+8 all year, with no daylight saving.
const MYT_OFFSET_MS = 8 * 3_600_000
const LOW_VOLUME_RESOLVED = 10

const startOfDay = (date: string) => Date.parse(`${date}T00:00:00+08:00`)
const mytDate = (ms: number) => new Date(ms + MYT_OFFSET_MS).toISOString().slice(0, 10)

// Rejects shapes like 2026-1-5 and dates that roll over, like 2026-02-30.
const isDate = (s: string | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(startOfDay(s)) && mytDate(startOfDay(s)) === s

// Monday of the current ISO week through today, in Malaysia time.
export function defaultRange(now = Date.now()) {
  const sinceMonday = (new Date(now + MYT_OFFSET_MS).getUTCDay() + 6) % 7
  return { from: mytDate(now - sinceMonday * DAY_MS), to: mytDate(now) }
}

export function parseReportQuery(
  query: URLSearchParams,
  now = Date.now(),
): { from: string; to: string; filters: ReportFilters; invalidField?: string } {
  const range = defaultRange(now)
  let invalidField: string | undefined
  const from = query.get('from')
  const to = query.get('to')
  if (from !== null && !isDate(from)) invalidField = 'from'
  else if (to !== null && !isDate(to)) invalidField = 'to'
  else if ((from ?? range.from) > (to ?? range.to)) invalidField = 'from'
  else Object.assign(range, from && { from }, to && { to })

  const filters: ReportFilters = { agentId: query.get('agentId') || undefined }
  for (const [field, allowed] of [['channel', CHANNELS], ['platform', PLATFORMS]] as const) {
    const value = query.get(field)
    if (!value) continue
    if ((allowed as readonly string[]).includes(value)) Object.assign(filters, { [field]: value })
    else invalidField ??= field
  }
  return { ...range, filters, invalidField }
}

type Row = {
  assignedAgentId: string | null
  channel: Channel
  platform: Platform
  status: 'open' | 'snoozed' | 'resolved'
  firstResponseMs: number | null
  resolutionMs: number | null
}

const GROUPS = {
  agent: (r: Row) => r.assignedAgentId ?? 'unassigned',
  channel: (r: Row) => r.channel,
  platform: (r: Row) => r.platform,
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
const present = (xs: (number | null)[]) => xs.filter((x) => x !== null)

export function summarize(rows: Row[]): Metrics {
  const resolved = rows.filter((r) => r.status === 'resolved')
  return {
    received: rows.length,
    resolved: resolved.length,
    avgFirstResponseMs: mean(present(rows.map((r) => r.firstResponseMs))),
    avgResolutionMs: mean(present(resolved.map((r) => r.resolutionMs))),
    lowVolume: resolved.length < LOW_VOLUME_RESOLVED,
  }
}

const firstInboundAt = sql`(select min(${messages.createdAt}) from ${messages}
  where ${messages.conversationId} = ${conversations.id} and ${messages.direction} = 'inbound')`
const firstResponseAt = sql`(select min(${messages.createdAt}) from ${messages}
  where ${messages.conversationId} = ${conversations.id} and ${messages.direction} = 'outbound'
  and ${messages.createdAt} > ${firstInboundAt})`
const resolvedAt = sql`(select max(${conversationHistory.changedAt}) from ${conversationHistory}
  where ${conversationHistory.conversationId} = ${conversations.id} and ${conversationHistory.toStatus} = 'resolved')`

// shortcut: aggregates in JS, fine for tens of thousands of conversations; move to SQL GROUP BY if reports exceed 3s (Req 8.3)
export function getMetrics(from: string, to: string, filters: ReportFilters): Report {
  wakeExpiredSnoozes(Date.now())
  const summary = db
    .select({
      open: sql<number>`count(*) filter (where ${conversations.status} = 'open')`,
      queue: sql<number>`count(*) filter (where ${conversations.status} = 'open' and ${conversations.assignedAgentId} is null)`,
      snoozed: sql<number>`count(*) filter (where ${conversations.status} = 'snoozed')`,
    })
    .from(conversations)
    .get()!

  const rows = db
    .select({
      assignedAgentId: conversations.assignedAgentId,
      channel: conversations.channel,
      platform: conversations.platform,
      status: conversations.status,
      firstResponseMs: sql<number | null>`${firstResponseAt} - ${firstInboundAt}`,
      resolutionMs: sql<number | null>`${resolvedAt} - ${conversations.createdAt}`,
    })
    .from(conversations)
    .where(and(gte(conversations.createdAt, startOfDay(from)), lt(conversations.createdAt, startOfDay(to) + DAY_MS)))
    .all()
    .filter(
      (r) =>
        (!filters.agentId || GROUPS.agent(r) === filters.agentId) &&
        (!filters.channel || r.channel === filters.channel) &&
        (!filters.platform || r.platform === filters.platform),
    )

  const breakdown = Object.fromEntries(
    Object.entries(GROUPS).map(([name, key]) => [
      name,
      [...Map.groupBy(rows, key)]
        .map(([k, group]) => ({ key: k, ...summarize(group) }))
        .sort((a, b) => b.received - a.received),
    ]),
  ) as Report['breakdown']

  return { range: { from, to }, summary, totals: summarize(rows), breakdown }
}
