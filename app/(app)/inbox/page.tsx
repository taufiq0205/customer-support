import { InboxIcon } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { currentUser } from '@/lib/auth/current-user'
import { getConversations, parseConversationQuery } from '@/lib/services/conversation'
import { InboxFilters } from './inbox-filters'
import { CHANNEL_LABELS, formatTime, PLATFORM_LABELS } from './labels'

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await currentUser()
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of [value ?? []].flat()) query.append(key, v)
  }
  // Unknown filter values are ignored here; the API route is the one that rejects them.
  const { items } = getConversations(parseConversationQuery(query, session).filters, session)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="font-heading text-lg font-semibold">Inbox</h1>
      <InboxFilters values={Object.fromEntries(query)} />
      {items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No conversations</EmptyTitle>
            <EmptyDescription>Nothing matches these filters yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {items.map((c) => (
            <Item key={c.id} variant="outline" render={<Link href={`/inbox/${c.id}`} />}>
              <ItemContent className="min-w-0">
                <ItemTitle>{c.customerName ?? c.customerIdentifier ?? 'Unknown customer'}</ItemTitle>
                <ItemDescription className="truncate">{c.lastMessagePreview}</ItemDescription>
              </ItemContent>
              <ItemActions className="flex-col items-end">
                <div className="flex items-center gap-2">
                  {c.lastMessageAt !== null && (
                    <time dateTime={new Date(c.lastMessageAt).toISOString()} className="text-xs text-muted-foreground">
                      {formatTime(c.lastMessageAt)}
                    </time>
                  )}
                  {c.unreadCount > 0 && (
                    <Badge aria-label={`${c.unreadCount} unread`}>
                      {c.unreadCount}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Badge variant="outline">{PLATFORM_LABELS[c.platform]}</Badge>
                  <Badge variant="secondary">{CHANNEL_LABELS[c.channel]}</Badge>
                </div>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </div>
  )
}
