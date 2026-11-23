'use client'

import { CircleAlertIcon, SendIcon, SparklesIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from '@/components/ui/input-group'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import type { CannedResponse } from '@/lib/services/canned-response'
import { fetchCannedResponses, shortcodeQuery, substitutePlaceholder } from './canned-responses'
import { useSendReply } from './send-reply'
import { requestSuggestion } from './suggest-reply'

export function ComposeArea({
  conversationId,
  aiEnabled,
  customerName,
}: {
  conversationId: string
  aiEnabled: boolean
  customerName: string | null
}) {
  const [text, setText] = useState('')
  const { state, send, reset } = useSendReply(conversationId)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
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
    setText(next)
    setActive(0)
    setDismissed(false)
    if (state.kind === 'error') reset()
    setSuggestError(null)
  }

  // A customer without a name keeps the token visible, so the agent fills it in instead of sending "Hi ,".
  const insert = (r: CannedResponse) => edit(customerName === null ? r.body : substitutePlaceholder(r.body, customerName))

  const submit = async (confirmResend = false) => {
    if (sending || empty) return
    if (await send(text, confirmResend)) setText('')
  }

  const suggest = async () => {
    setSuggesting(true)
    setSuggestError(null)
    const result = await requestSuggestion(conversationId)
    setSuggesting(false)
    if ('error' in result) return setSuggestError(result.error)
    // Never discard what the agent typed, including while the request was in flight.
    setText((current) => (current.trim() === '' ? result.suggestion : `${current}\n\n${result.suggestion}`))
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
          <AlertAction>
            <Button type="button" size="xs" variant="outline" onClick={() => void submit(state.duplicate)}>
              {state.duplicate ? 'Send anyway' : 'Retry'}
            </Button>
          </AlertAction>
        </Alert>
      )}
      {suggestError && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>No suggestion</AlertTitle>
          <AlertDescription>{suggestError}</AlertDescription>
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
          value={text}
          readOnly={sending}
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
        <InputGroupAddon align="block-end">
          <InputGroupText className="mr-auto">Ctrl or ⌘ + Enter to send</InputGroupText>
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
          <InputGroupButton type="submit" variant="default" size="sm" disabled={sending || empty}>
            {sending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
            {sending ? 'Sending' : 'Send'}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {!aiEnabled && (
        <p className="text-xs text-muted-foreground">AI suggestions are off. A supervisor can configure them in AI settings.</p>
      )}
    </form>
  )
}
