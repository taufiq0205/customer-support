import { InboxIcon } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import type { Session } from '@/lib/auth/session'
import { getConversations, parseConversationQuery } from '@/lib/services/conversation'
import { InboxFilters } from './inbox-filters'
import {
  caseLabel,
  channelPresentation,
  formatTime,
  inboxHref,
  inboxQuery,
  platformLabel,
  statusLabel,
} from './labels'

export type InboxSearchParams = Record<string, string | string[] | undefined>

export function InboxQueue({
  searchParams,
  session,
  selectedId,
}: {
  searchParams: InboxSearchParams
  session: Session
  selectedId?: string
}) {
  const query = inboxQuery(searchParams)
  const filterQuery = new URLSearchParams(query)
  if (!filterQuery.has('status')) filterQuery.set('status', 'open')
  const { filters } = parseConversationQuery(filterQuery, session)
  const { items, nextCursor } = getConversations(filters, session)
  const nextPageQuery = new URLSearchParams(query)
  if (nextCursor) nextPageQuery.set('page', nextCursor)
  const filtered = Boolean(
    filters.search ||
    (query.has('status') && filters.status) ||
    filters.platform ||
    filters.channel ||
    filters.assignedAgentId !== undefined
  )

  return (
    <section aria-label="Conversation queue" className="flex h-full min-h-0 flex-col border-r bg-card">
      <header className="flex shrink-0 flex-col gap-3 border-b p-3">
        <h1 className="font-heading text-lg font-semibold">Inbox</h1>
        <InboxFilters values={searchParams} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <Empty className="min-h-48 border-0 p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
              <EmptyTitle>
                {filtered
                  ? 'No matching conversations'
                  : query.has('page')
                    ? 'No conversations on this page'
                    : 'No conversations'}
              </EmptyTitle>
              <EmptyDescription>
                {filtered ? 'Try changing or clearing the filters.' : 'Nothing is waiting in the inbox yet.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup aria-label="Conversations" className="gap-1.5">
            {items.map((conversation) => {
              const channel = channelPresentation(conversation.channel)
              return (
                <Item
                  key={conversation.id}
                  size="xs"
                  variant="outline"
                  className={selectedId === conversation.id ? 'border-primary bg-muted/60' : ''}
                  aria-current={selectedId === conversation.id ? 'page' : undefined}
                  render={<Link href={inboxHref(query, conversation.id)} />}
                >
                  <ItemContent className="min-w-0 gap-1">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <ItemTitle className="font-mono text-xs font-semibold tracking-wide">
                        {caseLabel(conversation.id)}
                      </ItemTitle>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {conversation.lastMessageAt !== null && (
                          <time
                            dateTime={new Date(conversation.lastMessageAt).toISOString()}
                            className="text-[11px] text-muted-foreground"
                          >
                            {formatTime(conversation.lastMessageAt)}
                          </time>
                        )}
                        {conversation.unreadCount > 0 ? (
                          <Badge aria-label={`${conversation.unreadCount} unread`} className="h-5 px-1.5">
                            {conversation.unreadCount}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-5 px-1.5">
                            {statusLabel(conversation.status)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="truncate text-sm font-medium">
                      {conversation.customerName ?? conversation.customerIdentifier ?? 'Unknown customer'}
                    </p>
                    <ItemDescription className="line-clamp-1 text-xs">
                      {conversation.lastMessagePreview || 'No message preview'}
                    </ItemDescription>
                    <div className="pt-0.5">
                      <Badge variant={channel.className ? 'default' : 'outline'} className={channel.className}>
                        {channel.label}
                      </Badge>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {platformLabel(conversation.platform)}
                      </span>
                    </div>
                  </ItemContent>
                </Item>
              )
            })}
          </ItemGroup>
        )}
        {nextCursor && (
          <div className="flex justify-center py-3">
            <Link href={inboxHref(nextPageQuery)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Next page
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
