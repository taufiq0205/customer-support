import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UnavailablePanel } from '@/components/unavailable-panel'
import { cn } from '@/lib/utils'
import type { Channel, Platform } from '@/lib/adapters/types'
import { currentUser } from '@/lib/auth/current-user'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getMetrics, parseReportQuery, type BreakdownRow, type Metrics } from '@/lib/services/report'
import { CHANNEL_LABELS, formatDuration, PLATFORM_LABELS } from '../inbox/labels'
import { ReportFilters } from './report-filters'

const LowVolume = ({ metrics }: { metrics: Metrics }) =>
  metrics.lowVolume && <Badge variant="outline">Low volume</Badge>

function Breakdown({ title, rows, label }: { title: string; rows: BreakdownRow[]; label: (key: string) => string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading font-medium">By {title}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{title}</TableHead>
            <TableHead className="text-right">Received</TableHead>
            <TableHead className="text-right">Resolved</TableHead>
            <TableHead className="text-right">Avg first response</TableHead>
            <TableHead className="text-right">Avg resolution</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No conversations in this range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{label(row.key)}</TableCell>
                <TableCell className="text-right">{row.received}</TableCell>
                <TableCell className="text-right">{row.resolved}</TableCell>
                <TableCell className="text-right">{formatDuration(row.avgFirstResponseMs)}</TableCell>
                <TableCell className="text-right">{formatDuration(row.avgResolutionMs)}</TableCell>
                <TableCell>
                  <LowVolume metrics={row} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  )
}

function Stat({ label, value, children }: { label: string; value: string | number; children?: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="flex items-center gap-2 text-2xl">
          {value}
          {children}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

function TeamReports({ query }: { query: URLSearchParams }) {
  // Invalid values fall back to defaults here; the API route is the one that rejects them.
  const { from, to, filters } = parseReportQuery(query)
  const { summary, totals, breakdown } = getMetrics(from, to, filters)
  const names = new Map(db.select({ id: users.id, displayName: users.displayName }).from(users).all().map((u) => [u.id, u.displayName]))
  const agentLabel = (key: string) => (key === 'unassigned' ? 'Unassigned' : (names.get(key) ?? key))

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Open now" value={summary.open} />
        <Stat label="In queue now" value={summary.queue} />
        <Stat label="Snoozed now" value={summary.snoozed} />
      </div>
      <ReportFilters
        values={{ from, to, ...filters }}
        agents={[
          { label: 'Unassigned', value: 'unassigned' },
          ...[...names].map(([id, name]) => ({ label: name, value: id })),
        ]}
      />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Received" value={totals.received} />
        <Stat label="Resolved" value={totals.resolved}>
          <LowVolume metrics={totals} />
        </Stat>
        <Stat label="Avg first response" value={formatDuration(totals.avgFirstResponseMs)} />
        <Stat label="Avg resolution" value={formatDuration(totals.avgResolutionMs)} />
      </div>
      <Breakdown title="Agent" rows={breakdown.agent} label={agentLabel} />
      <Breakdown title="Channel" rows={breakdown.channel} label={(key) => CHANNEL_LABELS[key as Channel]} />
      <Breakdown title="Platform" rows={breakdown.platform} label={(key) => PLATFORM_LABELS[key as Platform]} />
      <UnavailablePanel title="Customer satisfaction">Survey responses and scores are unavailable until a CSAT data source is connected.</UnavailablePanel>
    </>
  )
}

function Escalations() {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <UnavailablePanel title="SLA alerts">Response deadlines and at-risk cases are unavailable until SLA tracking is connected.</UnavailablePanel>
        <UnavailablePanel title="Batch alerts">Production batch signals are unavailable until batch data is connected.</UnavailablePanel>
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
        <UnavailablePanel title="Approval queue">Escalation requests and approval history are unavailable until routing is connected.</UnavailablePanel>
        <UnavailablePanel title="Approval details">
          <div className="flex flex-col gap-3">
            <p>Case evidence and decision details are unavailable until escalation requests are connected.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled variant="outline">Return to agent</Button>
              <Button disabled>Approve</Button>
            </div>
          </div>
        </UnavailablePanel>
      </div>
    </>
  )
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await currentUser()
  if (session.role !== 'supervisor') redirect('/inbox')

  const params = await searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    for (const v of [value ?? []].flat()) query.append(key, v)
  }
  const view = query.get('view') === 'escalations' ? 'escalations' : 'team'
  const hrefFor = (target: typeof view) => {
    const nextQuery = new URLSearchParams(query)
    if (target === 'team') nextQuery.delete('view')
    else nextQuery.set('view', target)
    const search = nextQuery.toString()
    return search ? `/reports?${search}` : '/reports'
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <h1 className="font-heading text-lg font-semibold">Supervisor Desk</h1>
      <nav aria-label="Supervisor reports" className="flex min-w-0 border-b">
        {([
          { value: 'team', label: 'Team reports' },
          { value: 'escalations', label: 'Escalations' },
        ] as const).map(({ value, label }) => (
          <Link
            key={value}
            href={hrefFor(value)}
            aria-current={view === value ? 'page' : undefined}
            className={cn(
              'flex min-h-10 items-center border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2',
              view === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {view === 'escalations' ? <Escalations /> : <TeamReports query={query} />}
    </div>
  )
}
