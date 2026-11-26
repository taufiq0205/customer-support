import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
    <Card className="min-w-0 gap-0 py-0">
      <h3 id={`report-by-${title.toLowerCase()}`} className="border-b px-4 py-3 font-heading font-semibold">By {title}</h3>
      <div
        role="region"
        aria-labelledby={`report-by-${title.toLowerCase()}`}
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&>[data-slot=table-container]]:overflow-visible"
      >
        <Table className="tabular-nums">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>{title}</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Resolved</TableHead>
              <TableHead className="text-right">Avg first response</TableHead>
              <TableHead className="text-right">Avg resolution</TableHead>
              <TableHead><span className="sr-only">Volume</span></TableHead>
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
      </div>
    </Card>
  )
}

function Stat({ label, value, children }: { label: string; value: string | number; children?: ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-2xl font-bold tabular-nums">
          {value}
        </CardTitle>
        {children && <div>{children}</div>}
      </CardHeader>
    </Card>
  )
}

// The live summary needs no subscription: AppProvider refreshes this page on conversation events.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await currentUser()
  if (session.role !== 'supervisor') redirect('/inbox')

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of [value ?? []].flat()) query.append(key, v)
  }
  // Invalid values fall back to defaults here; the API route is the one that rejects them.
  const { from, to, filters } = parseReportQuery(query)
  const { summary, totals, breakdown } = getMetrics(from, to, filters)
  const names = new Map(db.select({ id: users.id, displayName: users.displayName }).from(users).all().map((u) => [u.id, u.displayName]))
  const agentLabel = (key: string) => (key === 'unassigned' ? 'Unassigned' : (names.get(key) ?? key))

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-5 lg:p-7">
      <header className="border-b pb-4">
        <h1 className="font-heading text-xl font-bold">Supervisor Desk</h1>
      </header>

      <section aria-labelledby="queue-health" className="flex flex-col gap-3">
        <div>
          <h2 id="queue-health" className="font-heading font-semibold">Queue health</h2>
          <p className="text-sm text-muted-foreground">Live totals across all conversations.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Stat label="Open now" value={summary.open} />
          <Stat label="In queue now" value={summary.queue} />
          <Stat label="Snoozed now" value={summary.snoozed} />
        </div>
      </section>

      <section aria-labelledby="team-reports" className="flex flex-col gap-4">
        <h2 id="team-reports" className="font-heading font-semibold">Team reports</h2>
        <ReportFilters
          values={{ from, to, ...filters }}
          agents={[
            { label: 'Unassigned', value: 'unassigned' },
            ...[...names].map(([id, name]) => ({ label: name, value: id })),
          ]}
        />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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
      </section>
    </div>
  )
}
