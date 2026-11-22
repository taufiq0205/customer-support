'use client'

import { RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useSendReply } from './send-reply'

// An unconfirmed reply may already have reached the customer, so resending it is the agent's explicit choice.
export function RetryButton({ conversationId, body, unconfirmed }: { conversationId: string; body: string; unconfirmed: boolean }) {
  const { state, send } = useSendReply(conversationId)
  const duplicate = state.kind === 'error' && state.duplicate
  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={state.kind === 'sending'}
        onClick={() => void send(body, unconfirmed || duplicate)}
      >
        {state.kind === 'sending' ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
        {duplicate ? 'Send anyway' : unconfirmed ? 'Resend' : 'Retry'}
      </Button>
      {state.kind === 'error' && (
        <span role="alert" className="text-destructive">
          {state.message}
        </span>
      )}
    </>
  )
}
