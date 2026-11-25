'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import type { Status } from '@/lib/services/conversation'

type Assignment =
  | { kind: 'claim'; agentId: string }
  | { kind: 'assign'; currentAgentId: string | null; agents: { id: string; displayName: string }[] }
  | null

const STATUS_ACTIONS: Record<Status, string> = {
  open: 'Reopen',
  snoozed: 'Snooze',
  resolved: 'Resolve',
}

function getErrorCode(value: unknown) {
  if (typeof value !== 'object' || value === null || !('error' in value)) return undefined
  return typeof value.error === 'string' ? value.error : undefined
}

function errorMessage(status: number, code: string | undefined) {
  if (status === 401) return 'Your session has expired. Sign in again to continue.'
  if (status === 403 || status === 404) return 'This case is no longer available to you.'
  if (code === 'invalid_agent') return 'That agent is unavailable. Choose an active agent and try again.'
  if (code === 'resolved') return 'This case is resolved and cannot be assigned.'
  if (code === 'invalid_transition') return 'The case status changed. The latest status has been loaded.'
  if (code === 'snooze_time_required') return 'Choose a future date and time to snooze this case.'
  if (status === 409) return 'The case changed before this update. The latest status has been loaded.'
  return 'Could not update this case. Try again.'
}

export function CaseControls({
  conversationId,
  assignment,
  transitions,
}: {
  conversationId: string
  assignment: Assignment
  transitions: readonly Status[]
}) {
  const router = useRouter()
  const currentAgentId = assignment?.kind === 'assign' ? assignment.currentAgentId : undefined
  const [selectedAgentId, setSelectedAgentId] = useState(currentAgentId ?? '')
  const [snoozeDate, setSnoozeDate] = useState('')
  const [reason, setReason] = useState('')
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setSelectedAgentId(currentAgentId ?? ''), [currentAgentId])

  const update = async (path: 'assign' | 'status', body: Record<string, string | number>) => {
    setError(null)
    setPending(true)
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/${path}`, {
        method: path === 'assign' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        const code = getErrorCode(payload)
        setError(errorMessage(response.status, code))
        if ([401, 403, 404, 409].includes(response.status) || code === 'invalid_agent') router.refresh()
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('Could not update this case. Check your connection and try again.')
      return false
    } finally {
      setPending(false)
    }
  }

  const changeStatus = async (toStatus: Status, snoozedUntil?: number, reason?: string) => {
    const body: Record<string, string | number> = { toStatus }
    if (snoozedUntil !== undefined) body.snoozedUntil = snoozedUntil
    if (reason?.trim()) body.reason = reason.trim()
    if (await update('status', body)) setSnoozeOpen(false)
  }

  const snooze = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const snoozedUntil = new Date(snoozeDate).getTime()
    if (!Number.isFinite(snoozedUntil) || snoozedUntil <= Date.now()) {
      setError('Choose a future date and time to snooze this case.')
      return
    }
    await changeStatus('snoozed', snoozedUntil, reason)
  }

  return (
    <div role="group" aria-label="Case ownership and status" aria-busy={pending} className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto">
      {assignment?.kind === 'claim' && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void update('assign', { agentId: assignment.agentId })}>
          {pending && <Spinner data-icon="inline-start" />}
          Claim
        </Button>
      )}
      {assignment?.kind === 'assign' && (assignment.agents.length > 0 ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <Select
            items={assignment.agents.map((agent) => ({ label: agent.displayName, value: agent.id }))}
            value={selectedAgentId || null}
            onValueChange={(value) => setSelectedAgentId(value ?? '')}
            disabled={pending}
          >
            <SelectTrigger aria-label="Assign to agent" className="max-w-40">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {assignment.agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>{agent.displayName}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !selectedAgentId || selectedAgentId === currentAgentId}
            onClick={() => void update('assign', { agentId: selectedAgentId })}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {currentAgentId ? 'Reassign' : 'Assign'}
          </Button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">No active agents available</span>
      ))}

      {transitions.map((toStatus) => toStatus === 'snoozed' ? (
        <Button key={toStatus} type="button" size="sm" variant="outline" disabled={pending} onClick={() => setSnoozeOpen((open) => !open)}>
          Snooze
        </Button>
      ) : (
        <Button
          key={toStatus}
          type="button"
          size="sm"
          variant={toStatus === 'resolved' ? 'outline' : 'secondary'}
          disabled={pending}
          onClick={() => void changeStatus(toStatus)}
        >
          {pending && <Spinner data-icon="inline-start" />}
          {STATUS_ACTIONS[toStatus]}
        </Button>
      ))}

      {snoozeOpen && transitions.includes('snoozed') && (
        <form className="flex w-full flex-wrap items-end gap-2" onSubmit={(event) => void snooze(event)}>
          <FieldGroup className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="snooze-until">Snooze until</FieldLabel>
              <Input
                id="snooze-until"
                type="datetime-local"
                required
                value={snoozeDate}
                disabled={pending}
                onChange={(event) => setSnoozeDate(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="snooze-reason">Reason (optional)</FieldLabel>
              <Input
                id="snooze-reason"
                disabled={pending}
                placeholder="Add a note"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Snooze case
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setSnoozeOpen(false)}>
            Cancel
          </Button>
        </form>
      )}
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </div>
  )
}
