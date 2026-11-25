'use client'

import { CircleAlertIcon, SendIcon, SparklesIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { useReplyDrafts } from '@/app/(app)/app-provider'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from '@/components/ui/input-group'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import type { CannedResponse } from '@/lib/services/canned-response'
import { fetchCannedResponses, shortcodeQuery, substitutePlaceholder } from './canned-responses'

export function ComposeArea({
  conversationId,
  aiEnabled,
  customerName,
  channel,
}: {
  conversationId: string
  aiEnabled: boolean
  customerName: string | null
  channel: { label: string; className: string }
}) {
  const router = useRouter()
  const drafts = useReplyDrafts()
  const readDraft = () => drafts.get(conversationId)
  const { text, send: state, suggestion } = useSyncExternalStore(drafts.subscribe, readDraft, readDraft)
  const suggesting = suggestion.kind === 'pending'
  const sending = state.kind === 'sending'
  const empty = text.trim() === ''

  const query = shortcodeQuery(text)
  // Tagged with their query so a slow response for an older prefix never shows.
  const [results, setResults] = useState<{ query: string; items: CannedResponse[] }>({ query: '', items: [] })
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const listId = useId()
  const matches = query !== null && !dismissed && results.query === query ? results.items : []
  const open = matches.length > 0

  useEffect(() => {
    if (query === null) return
    let current = true
    void fetchCannedResponses(query).then((items) => current && setResults({ query, items }))
    return () => {
      current = false
    }
  }, [query])

  const edit = (next: string) => {
    drafts.edit(conversationId, next)
    setActive(0)
    setDismissed(false)
  }

  // A customer without a name keeps the token visible, so the agent fills it in instead of sending "Hi ,".
  const insert = (r: CannedResponse) => edit(customerName === null ? r.body : substitutePlaceholder(r.body, customerName))

  const submit = async (confirmResend = false) => {
    if (await drafts.send(conversationId, confirmResend)) router.refresh()
  }

  const suggest = async () => {
    if (await drafts.suggest(conversationId)) router.refresh()
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {state.kind === 'error' && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Reply not sent</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
          {state.submitted === text && (
            <AlertAction>
              <Button type="button" size="sm" variant="outline" onClick={() => void submit(state.duplicate)}>
                {state.duplicate ? 'Send anyway' : 'Retry'}
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}
      {suggestion.kind === 'error' && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>No suggestion</AlertTitle>
          <AlertDescription>{suggestion.message}</AlertDescription>
        </Alert>
      )}
      {open && (
        <ItemGroup id={listId} role="listbox" aria-label="Canned responses" className="max-h-60 gap-0 overflow-y-auto rounded-lg border p-1">
          {matches.map((r, i) => (
            <Item
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              size="xs"
              variant={i === active ? 'muted' : 'default'}
              className="cursor-pointer"
              // Keep focus in the textarea so typing and arrow keys keep working.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(r)}
            >
              <ItemContent>
                <ItemTitle>/{r.shortcode} · {r.name}</ItemTitle>
                <ItemDescription className="line-clamp-1">{r.body}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
      <InputGroup>
        <InputGroupTextarea
          aria-label="Reply"
          placeholder="Type a reply, or / for a canned response"
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          className="max-h-28 sm:max-h-40"
          value={text}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (open && !e.metaKey && !e.ctrlKey && !e.altKey) {
              const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
              if (step) {
                e.preventDefault()
                return setActive((active + step + matches.length) % matches.length)
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                return insert(matches[active])
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                return setDismissed(true)
              }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <InputGroupAddon align="block-end" className="flex-wrap">
          <InputGroupText className="mr-auto hidden xl:inline-flex">Ctrl or ⌘ + Enter to send</InputGroupText>
          {aiEnabled && (
            <InputGroupButton
              type="button"
              variant="outline"
              size="sm"
              disabled={suggesting || sending}
              onClick={() => void suggest()}
            >
              {suggesting ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
              Suggest reply
            </InputGroupButton>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" className={channel.className}>Via {channel.label}</Badge>
            <InputGroupButton type="submit" variant="default" size="sm" disabled={sending || empty}>
              {sending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
              {sending ? 'Sending' : 'Send'}
            </InputGroupButton>
          </div>
        </InputGroupAddon>
      </InputGroup>
      {!aiEnabled && (
        <p className="text-xs text-muted-foreground">AI suggestions are off. A supervisor can configure them in AI settings.</p>
      )}
    </form>
  )
}
