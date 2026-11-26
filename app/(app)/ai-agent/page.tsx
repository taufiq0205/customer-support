import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { buttonVariants, Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { UnavailablePanel } from '@/components/unavailable-panel'
import { currentUser } from '@/lib/auth/current-user'
import { CHANNELS } from '@/lib/adapters/types'
import { cn } from '@/lib/utils'
import { CHANNEL_LABELS } from '../inbox/labels'

const views = [
  { id: 'overview', label: 'Overview' },
  { id: 'agent_config', label: 'Agent Config' },
  { id: 'knowledge_base', label: 'Knowledge Base' },
  { id: 'knowledge_gaps', label: 'Knowledge Gaps' },
  { id: 'sentiment', label: 'Customer Sentiment' },
  { id: 'drift', label: 'Drift Detection' },
] as const

type View = (typeof views)[number]['id']
type SearchValue = string | string[] | undefined

const gapCategories = [
  { id: 'all', label: 'All categories' },
  { id: 'reprints', label: 'Reprints' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'pre-press', label: 'Pre-Press' },
  { id: 'print-quality', label: 'Print Quality' },
  { id: 'verification', label: 'Verification' },
] as const

const sentimentFilters = [
  { id: 'all', label: 'All estimates' },
  { id: 'positive', label: 'Positive' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'negative', label: 'Negative' },
  { id: 'unknown', label: 'Unknown' },
] as const

const driftSignals = [
  { id: 'comparison-windows', label: 'Comparison windows', detail: 'Recent and baseline periods' },
  { id: 'sample-size', label: 'Sample sizes', detail: 'Cases included in each window' },
  { id: 'model-version', label: 'Model version', detail: 'Model used for the signal' },
  { id: 'knowledge-version', label: 'Knowledge version', detail: 'Knowledge snapshot used for the signal' },
  { id: 'affected-cases', label: 'Affected cases', detail: 'Cases associated with the signal' },
  { id: 'related-gaps', label: 'Related knowledge gaps', detail: 'Knowledge gaps associated with the signal' },
] as const

function valueOf(value: SearchValue) {
  return Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value
}

function viewHref(tab: View, key?: string, value?: string) {
  const params = new URLSearchParams({ tab })
  if (key && value) params.set(key, value)
  return `/ai-agent?${params.toString()}`
}

function FilterLinks({
  label,
  items,
  selected,
  tab,
  queryKey,
}: {
  label: string
  items: readonly { id: string; label: string }[]
  selected: string
  tab: View
  queryKey: 'category' | 'sentiment' | 'signal'
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={viewHref(tab, queryKey, item.id)}
          aria-current={selected === item.id ? 'page' : undefined}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Badge variant={selected === item.id ? 'default' : 'outline'}>{item.label}</Badge>
        </Link>
      ))}
    </nav>
  )
}

function WorkspaceNavigation({ selected }: { selected: View }) {
  return (
    <nav aria-label="AI Agent views" className="flex flex-wrap gap-1 border-b pb-2">
      {views.map(({ id, label }) => (
        <Link
          key={id}
          href={viewHref(id)}
          aria-current={selected === id ? 'page' : undefined}
          className={cn(
            'shrink-0 rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected === id
              ? 'bg-secondary font-medium text-secondary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}

function Overview() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>AI performance</CardTitle>
            <CardDescription>Resolution rates use the same AI-handled case cohort. Reporting data is not connected.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled aria-label="Reporting period, unavailable">Last 7 days</Button>
            <Button variant="outline" disabled aria-label="Reporting channel, unavailable">All channels</Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <UnavailablePanel title="AI messages sent">Delivered customer-facing messages sent by AI. AI-generated drafts sent by humans are tracked separately. Delivery events with sender attribution are unavailable.</UnavailablePanel>
          <UnavailablePanel title="Full AI resolution rate">A case resolved without human handling. AI-handled cases and final outcomes are unavailable.</UnavailablePanel>
          <UnavailablePanel title="Partial AI resolution rate">AI answered a substantive part, handed off the rest, and a human completed the case. These outcomes are unavailable.</UnavailablePanel>
          <UnavailablePanel title="Unable-to-answer handoff rate">Cases where AI could not answer. Handoff reasons and eligible cases are unavailable.</UnavailablePanel>
          <UnavailablePanel title="Pending human handoffs">A separate count of cases awaiting an agent or supervisor. Current handoff state is unavailable.</UnavailablePanel>
          <UnavailablePanel title="Policy-required transfers">A separate measure for cases transferred by policy. Transfer events and policy outcomes are unavailable.</UnavailablePanel>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Suggestion provider</CardTitle>
            <CardDescription>The existing provider drafts replies for human agents.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings#reply-suggestions"
            className={buttonVariants({ variant: 'default' })}
          >
            Reply Suggestion Provider
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function AgentConfig() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <UnavailablePanel title="Instructions">
        <Textarea aria-label="Future agent instructions" disabled placeholder="Agent instructions are not connected." />
      </UnavailablePanel>
      <UnavailablePanel title="Allowed channels">
        <fieldset disabled className="grid grid-cols-2 gap-2 text-sm">
          {CHANNELS.map((channel) => (
            <label key={channel} className="flex items-center gap-2">
              <input type="checkbox" />
              {CHANNEL_LABELS[channel]}
            </label>
          ))}
        </fieldset>
      </UnavailablePanel>
      <UnavailablePanel title="Knowledge sources">
        <Input aria-label="Future knowledge sources" disabled placeholder="Approved sources are not connected." />
      </UnavailablePanel>
      <UnavailablePanel title="Handoff rules">
        Order verification, policy transfers, and handoff thresholds have no configuration source.
      </UnavailablePanel>
      <UnavailablePanel title="Autonomous agent pause">
        <p>This pause control applies to a future autonomous agent. The current product only provides draft reply suggestions.</p>
        <Button disabled variant="outline" className="mt-2">Pause autonomous agent</Button>
      </UnavailablePanel>
      <UnavailablePanel title="Draft and publish">
        <p>Agent configuration has no draft or published version.</p>
        <div className="mt-2 flex gap-2">
          <Button disabled variant="outline">Save draft</Button>
          <Button disabled>Publish</Button>
        </div>
      </UnavailablePanel>
    </div>
  )
}

function KnowledgeBase() {
  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <UnavailablePanel title="Article list">
        <p>Article records and category filters are not connected.</p>
        <Input className="mt-3" disabled aria-label="Search articles" placeholder="Search articles" />
      </UnavailablePanel>
      <UnavailablePanel title="Article editor">
        <div className="flex flex-col gap-2">
          <Input disabled aria-label="Article title" placeholder="Article title" />
          <Textarea disabled aria-label="Article content" placeholder="Article content" />
          <div className="flex flex-wrap gap-2">
            <Button disabled variant="outline">Save draft</Button>
            <Button disabled>Publish article</Button>
          </div>
        </div>
      </UnavailablePanel>
      <UnavailablePanel title="Source and retrieval preview">
        <p>Source ownership, article evidence, and retrieval validation require a connected knowledge source.</p>
        <Button disabled variant="outline" className="mt-2">Preview retrieval</Button>
      </UnavailablePanel>
    </div>
  )
}

function KnowledgeGaps({ category }: { category: (typeof gapCategories)[number] }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Unanswered question categories</CardTitle>
          <CardDescription>Selected category: {category.label}. Categorized unanswered events are not connected.</CardDescription>
        </CardHeader>
        <CardContent><FilterLinks label="Knowledge gap category" items={gapCategories} selected={category.id} tab="knowledge_gaps" queryKey="category" /></CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <UnavailablePanel title="Frequency">Question counts for this selection require a source of unanswered events.</UnavailablePanel>
        <UnavailablePanel title="Example questions">Example customer questions are unavailable.</UnavailablePanel>
        <UnavailablePanel title="Handoff reason">Handoff reasons for this category are unavailable.</UnavailablePanel>
        <UnavailablePanel title="Linked cases and articles">Source cases and related knowledge articles are unavailable.</UnavailablePanel>
      </div>
      <UnavailablePanel title="Draft and retrieval validation">Draft creation, retrieval preview, article validation, and publishing require a connected knowledge source.</UnavailablePanel>
    </div>
  )
}

function CustomerSentiment({ sentiment }: { sentiment: (typeof sentimentFilters)[number] }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Estimated customer sentiment</CardTitle>
          <CardDescription>Selected estimate: {sentiment.label}. Sentiment labels and their evidence are unknown.</CardDescription>
        </CardHeader>
        <CardContent><FilterLinks label="Sentiment estimate" items={sentimentFilters} selected={sentiment.id} tab="sentiment" queryKey="sentiment" /></CardContent>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        <UnavailablePanel title="Sentiment trend">Time windows, label counts, and evidence thresholds are unavailable.</UnavailablePanel>
        <UnavailablePanel title="Case evidence">Case links and the messages supporting an estimate are unavailable.</UnavailablePanel>
      </div>
    </div>
  )
}

function DriftDetection({ signal }: { signal: (typeof driftSignals)[number] }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Drift signal details</CardTitle>
          <CardDescription>Selected detail: {signal.label}. Drift signals and comparisons are unavailable.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FilterLinks label="Drift detail" items={driftSignals} selected={signal.id} tab="drift" queryKey="signal" />
          <p className="text-sm text-muted-foreground">{signal.detail}. Comparable drift data is unavailable.</p>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UnavailablePanel title="Comparison windows">Recent and baseline periods cannot be compared without drift data.</UnavailablePanel>
        <UnavailablePanel title="Sample sizes">The number of cases in each window is unknown.</UnavailablePanel>
        <UnavailablePanel title="Model version">No model version is attached to a signal.</UnavailablePanel>
        <UnavailablePanel title="Knowledge version">No knowledge snapshot is attached to a signal.</UnavailablePanel>
        <UnavailablePanel title="Affected cases">Affected case links are unavailable until a signal identifies cases.</UnavailablePanel>
        <UnavailablePanel title="Related knowledge gaps">
          <Link href={viewHref('knowledge_gaps')} className="underline underline-offset-4">Open Knowledge Gaps</Link>
          <span>. Specific related gaps are unavailable.</span>
        </UnavailablePanel>
      </div>
    </div>
  )
}

export default async function AiAgentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>
}) {
  const session = await currentUser()
  if (session.role !== 'supervisor') redirect('/inbox')

  const params = await searchParams
  const requestedTab = valueOf(params.tab)
  const tab = views.find(({ id }) => id === requestedTab)?.id ?? 'overview'
  const category = gapCategories.find(({ id }) => id === valueOf(params.category)) ?? gapCategories[0]
  const sentiment = sentimentFilters.find(({ id }) => id === valueOf(params.sentiment)) ?? sentimentFilters[0]
  const signal = driftSignals.find(({ id }) => id === valueOf(params.signal)) ?? driftSignals[0]

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">AI Agent</h1>
        <Badge variant="outline">Not connected</Badge>
      </header>
      <WorkspaceNavigation selected={tab} />
      {tab === 'overview' && <Overview />}
      {tab === 'agent_config' && <AgentConfig />}
      {tab === 'knowledge_base' && <KnowledgeBase />}
      {tab === 'knowledge_gaps' && <KnowledgeGaps category={category} />}
      {tab === 'sentiment' && <CustomerSentiment sentiment={sentiment} />}
      {tab === 'drift' && <DriftDetection signal={signal} />}
    </div>
  )
}
