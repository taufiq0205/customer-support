'use client'

import { RotateCcwIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { useReplyDrafts } from '@/app/(app)/app-provider'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

// An unconfirmed reply may already have reached the customer, so resending it is the agent's explicit choice.
export function RetryButton({
  conversationId, messageId, body, unconfirmed,
}: { conversationId: string; messageId: string; body: string; unconfirmed: boolean }) {
  const router = useRouter()
  const drafts = useReplyDrafts()
  const readRetry = () => drafts.get(conversationId).retries.get(messageId)
  const state = useSyncExternalStore(drafts.subscribe, readRetry, readRetry)
  const duplicate = state?.kind === 'error' && state.duplicate

  const retry = async () => {
    if (await drafts.retry(conversationId, messageId, body)) router.refresh()
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={state?.kind === 'sending'}
        onClick={() => void retry()}
      >
        {state?.kind === 'sending' ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
        {duplicate ? 'Send anyway' : unconfirmed ? 'Resend' : 'Retry'}
      </Button>
      {state?.kind === 'error' && (
        <span role="alert" className="text-destructive">
          {state.message}
        </span>
      )}
    </>
  )
}
