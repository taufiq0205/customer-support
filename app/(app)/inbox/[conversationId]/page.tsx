import { eq } from 'drizzle-orm'
import { ArrowLeftIcon, PaperclipIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ComposeArea } from '@/components/compose/ComposeArea'
import { RetryButton } from '@/components/compose/RetryButton'
import { UnavailablePanel } from '@/components/unavailable-panel'
import { Badge } from '@/components/ui/badge'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button, buttonVariants } from '@/components/ui/button'
import { Message, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { readAIConfig } from '@/lib/adapters/ai'
import { currentUser } from '@/lib/auth/current-user'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { listActiveAgents } from '@/lib/services/assignment'
import { getConversation, TRANSITIONS, type Message as ThreadMessage } from '@/lib/services/conversation'
import { ClearConversationNotifications } from '../../app-provider'
import { CaseControls } from '../case-controls'
import { InboxQueue, type InboxSearchParams } from '../inbox-queue'
import { caseLabel, channelPresentation, DELIVERY_LABELS, formatTime, inboxHref, inboxQuery, platformLabel, statusLabel } from '../labels'

const DELIVERY_VARIANTS: Record<ThreadMessage['status'], 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  sent: 'secondary',
  unconfirmed: 'outline',
  failed: 'destructive',
  delivered: 'secondary',
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>
  searchParams: Promise<InboxSearchParams>
}) {
  const session = await currentUser()
  const result = getConversation((await params).conversationId, session)
  if (!result.ok) notFound()
  const { conversation: c, messages } = result.value
  const filters = await searchParams
  const channel = channelPresentation(c.channel)
  const owner = c.assignedAgentId === null ? 'Unassigned' : (
    db.select({ name: users.displayName }).from(users).where(eq(users.id, c.assignedAgentId)).get()?.name
    ?? 'Unknown agent'
  )
  const assignment = c.status === 'resolved' ? null
    : session.role === 'supervisor'
      ? { kind: 'assign' as const, currentAgentId: c.assignedAgentId, agents: listActiveAgents() }
      : c.assignedAgentId === null ? { kind: 'claim' as const, agentId: session.userId } : null
  // Only the newest outbound copy of a body offers retry, so an old Resend cannot send a third copy.
  const latestByBody = new Map(messages.filter((m) => m.direction === 'outbound').map((m) => [m.body, m.id]))

  return (
    <div className="h-full min-h-0 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="hidden min-h-0 lg:block">
        <InboxQueue searchParams={filters} session={session} selectedId={c.id} />
      </div>
      <section key={c.id} aria-labelledby="thread-heading" className="flex h-full min-h-0 min-w-0 flex-col">
        <ClearConversationNotifications conversationId={c.id} />
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-3 py-3 sm:px-5">
          <Link
            href={inboxHref(inboxQuery(filters))}
            aria-label="Back to inbox"
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <ArrowLeftIcon />
          </Link>
          <div className="min-w-0 flex-1 xl:min-w-32">
            <p className="font-mono text-xs font-semibold text-muted-foreground" title={c.id}>{caseLabel(c.id)}</p>
            <h1 id="thread-heading" className="break-words font-heading text-lg font-semibold">
              {c.customerName ?? c.customerIdentifier ?? 'Unknown customer'}
            </h1>
            <p className="break-words text-xs text-muted-foreground">Owner: {owner}</p>
          </div>
          <Badge variant="secondary" className={channel.className}>{channel.label}</Badge>
          <Badge variant="outline">{statusLabel(c.status)}</Badge>
          <CaseControls conversationId={c.id} assignment={assignment} transitions={TRANSITIONS[c.status] ?? []} />
        </header>
        <details className="min-h-0 shrink-0 border-b bg-card px-3 text-sm sm:px-5">
          <summary className="w-fit cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
            Case context
          </summary>
          <div
            role="region"
            aria-label="Case context details"
            tabIndex={0}
            className="max-h-[35svh] md:max-h-[min(45svh,32rem)] overflow-y-auto overscroll-contain pb-3 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Case ID</dt>
              <dd className="break-all font-mono">{c.id}</dd>
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="break-words">{c.customerName ?? c.customerIdentifier ?? 'Unknown customer'}</dd>
              <dt className="text-muted-foreground">Channel</dt>
              <dd>{channel.label}</dd>
              <dt className="text-muted-foreground">Platform</dt>
              <dd>{platformLabel(c.platform)}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{statusLabel(c.status)}</dd>
              <dt className="text-muted-foreground">Owner</dt>
              <dd className="break-words">{owner}</dd>
            </dl>
            <div className="mt-3 grid gap-2">
              <UnavailablePanel title="Order and production">Order lookup, verification, shipment, and print status.</UnavailablePanel>
              <UnavailablePanel title="SLA and urgency">Response target, time remaining, and priority.</UnavailablePanel>
              <UnavailablePanel title="Photo previews">Images from this conversation.</UnavailablePanel>
              <UnavailablePanel title="Customer history and sentiment">Previous conversations and customer sentiment.</UnavailablePanel>
              <UnavailablePanel title="Linked channels">Other channel conversations for this customer.</UnavailablePanel>
              <UnavailablePanel title="Case actions">
                <p>Order verification and approval workflows are required before these decisions can be made.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {['Reprint', 'Place hold', 'Refund', 'Escalate', 'Override'].map((action) => (
                    <Button key={action} type="button" size="sm" variant="outline" disabled>
                      {action}
                    </Button>
                  ))}
                </div>
              </UnavailablePanel>
            </div>
          </div>
        </details>
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport tabIndex={0} aria-label="Messages" role="region">
              <MessageScrollerContent className="gap-4 p-3 sm:p-5">
                {messages.map((m) => {
                  const outbound = m.direction === 'outbound'
                  const delivery = Object.hasOwn(DELIVERY_LABELS, m.status)
                    ? { label: DELIVERY_LABELS[m.status], variant: DELIVERY_VARIANTS[m.status] }
                    : { label: 'Unknown delivery status', variant: 'outline' as const }
                  return (
                    <MessageScrollerItem key={m.id} messageId={m.id}>
                      <Message align={outbound ? 'end' : 'start'}>
                        <MessageContent>
                          {m.senderName && <MessageHeader>{m.senderName}</MessageHeader>}
                          {m.body && (
                            <Bubble variant={outbound ? 'default' : 'muted'} align={outbound ? 'end' : 'start'}>
                              <BubbleContent className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</BubbleContent>
                            </Bubble>
                          )}
                          {m.hasAttachment === 1 && (
                            <Badge variant="outline">
                              <PaperclipIcon data-icon="inline-start" />
                              Attachment
                            </Badge>
                          )}
                          <MessageFooter className="flex-wrap gap-2">
                            {m.sentAt !== null && <time dateTime={new Date(m.sentAt).toISOString()}>{formatTime(m.sentAt)}</time>}
                            {outbound && <Badge variant={delivery.variant}>{delivery.label}</Badge>}
                            {outbound && m.body && latestByBody.get(m.body) === m.id && (m.status === 'failed' || m.status === 'unconfirmed') && (
                              <RetryButton conversationId={c.id} messageId={m.id} body={m.body} unconfirmed={m.status === 'unconfirmed'} />
                            )}
                          </MessageFooter>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
        <div className="shrink-0 border-t bg-card p-3 sm:px-5">
          <ComposeArea conversationId={c.id} aiEnabled={readAIConfig() !== null} customerName={c.customerName} channel={channel} />
        </div>
      </section>
    </div>
  )
}
