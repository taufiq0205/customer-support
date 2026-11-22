'use client'

import { CircleAlertIcon, SendIcon, SparklesIcon } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { useSendReply } from './send-reply'
import { requestSuggestion } from './suggest-reply'

export function ComposeArea({ conversationId, aiEnabled }: { conversationId: string; aiEnabled: boolean }) {
  const [text, setText] = useState('')
  const { state, send, reset } = useSendReply(conversationId)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const sending = state.kind === 'sending'
  const empty = text.trim() === ''

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
      <InputGroup>
        <InputGroupTextarea
          aria-label="Reply"
          placeholder="Type a reply"
          value={text}
          readOnly={sending}
          onChange={(e) => {
            setText(e.target.value)
            if (state.kind === 'error') reset()
            setSuggestError(null)
          }}
          onKeyDown={(e) => {
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
