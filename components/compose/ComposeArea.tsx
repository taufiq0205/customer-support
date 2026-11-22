'use client'

import { CircleAlertIcon, SendIcon } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { useSendReply } from './send-reply'

export function ComposeArea({ conversationId }: { conversationId: string }) {
  const [text, setText] = useState('')
  const { state, send, reset } = useSendReply(conversationId)
  const sending = state.kind === 'sending'
  const empty = text.trim() === ''

  const submit = async (confirmResend = false) => {
    if (sending || empty) return
    if (await send(text, confirmResend)) setText('')
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
      <InputGroup>
        <InputGroupTextarea
          aria-label="Reply"
          placeholder="Type a reply"
          value={text}
          readOnly={sending}
          onChange={(e) => {
            setText(e.target.value)
            if (state.kind === 'error') reset()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <InputGroupText>Ctrl or ⌘ + Enter to send</InputGroupText>
          <InputGroupButton type="submit" variant="default" size="sm" className="ml-auto" disabled={sending || empty}>
            {sending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
            {sending ? 'Sending' : 'Send'}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
