import { ArrowLeftIcon, PaperclipIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Message, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { currentUser } from '@/lib/auth/current-user'
import { getConversation, type Message as ThreadMessage } from '@/lib/services/conversation'
import { CHANNEL_LABELS, DELIVERY_LABELS, formatTime, PLATFORM_LABELS, STATUS_LABELS } from '../labels'

const DELIVERY_VARIANTS: Record<ThreadMessage['status'], 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  sent: 'secondary',
  unconfirmed: 'outline',
  failed: 'destructive',
  delivered: 'secondary',
}

export default async function ThreadPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const session = await currentUser()
  const result = getConversation((await params).conversationId, session)
  if (!result.ok) notFound()
  const { conversation: c, messages } = result.value

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" render={<Link href="/inbox" aria-label="Back to inbox" />} nativeButton={false}>
          <ArrowLeftIcon />
        </Button>
        <h1 className="font-heading text-lg font-semibold">{c.customerName ?? c.customerIdentifier ?? 'Unknown customer'}</h1>
        <Badge variant="outline">{PLATFORM_LABELS[c.platform]}</Badge>
        <Badge variant="secondary">{CHANNEL_LABELS[c.channel]}</Badge>
        <Badge>{STATUS_LABELS[c.status]}</Badge>
      </header>
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="rounded-lg border">
          <MessageScrollerViewport>
            <MessageScrollerContent className="p-4">
              {messages.map((m) => {
                const outbound = m.direction === 'outbound'
                return (
                  <MessageScrollerItem key={m.id} messageId={m.id}>
                    <Message align={outbound ? 'end' : 'start'}>
                      <MessageContent>
                        {m.senderName && <MessageHeader>{m.senderName}</MessageHeader>}
                        {m.body && (
                          <Bubble variant={outbound ? 'default' : 'muted'} align={outbound ? 'end' : 'start'}>
                            <BubbleContent className="whitespace-pre-wrap">{m.body}</BubbleContent>
                          </Bubble>
                        )}
                        {m.hasAttachment === 1 && (
                          <Badge variant="outline">
                            <PaperclipIcon data-icon="inline-start" />
                            Attachment
                          </Badge>
                        )}
                        <MessageFooter className="gap-2">
                          {m.sentAt !== null && <time dateTime={new Date(m.sentAt).toISOString()}>{formatTime(m.sentAt)}</time>}
                          {outbound && <Badge variant={DELIVERY_VARIANTS[m.status]}>{DELIVERY_LABELS[m.status]}</Badge>}
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
    </div>
  )
}
