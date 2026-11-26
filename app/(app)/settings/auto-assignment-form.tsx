'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { currentAutoAssignRule, listActiveAgents } from '@/lib/services/assignment'
import { saveAutoAssignAction } from './actions'

export function AutoAssignmentForm({ rule, agents }: {
  rule: ReturnType<typeof currentAutoAssignRule>
  agents: ReturnType<typeof listActiveAgents>
}) {
  const [strategy, setStrategy] = useState<string>(rule?.strategy ?? '')
  const [agentId, setAgentId] = useState(rule?.manualAgentId ?? '')
  const [{ rule: savedRule, error }, action, pending] = useActionState(saveAutoAssignAction, { rule })
  const selectClass = 'h-9 w-full rounded-lg border border-input bg-background px-2 text-sm'

  return (
    <form action={action} onReset={(event) => event.preventDefault()}>
      <FieldGroup>
        <p role="status" className="text-sm text-muted-foreground">
          Current rule: {savedRule?.strategy === 'round_robin' ? 'Round robin'
            : savedRule?.strategy === 'manual' ? agents.find((agent) => agent.id === savedRule.manualAgentId)?.displayName ?? 'Agent unavailable'
            : 'Unassigned'}
        </p>
        <Field>
          <FieldLabel htmlFor="routing-strategy">Routing rule</FieldLabel>
          <select id="routing-strategy" name="strategy" className={selectClass} value={strategy}
            onChange={(event) => setStrategy(event.target.value)} disabled={pending} required>
            <option value="" disabled>Choose a rule</option>
            <option value="round_robin">Round robin</option>
            <option value="manual">Assign to a specific agent</option>
          </select>
        </Field>
        {strategy === 'manual' && (
          <Field>
            <FieldLabel htmlFor="routing-agent">Agent</FieldLabel>
            <select id="routing-agent" name="agentId" className={selectClass} value={agentId}
              onChange={(event) => setAgentId(event.target.value)} disabled={pending} required>
              <option value="">Choose an active agent</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.displayName}</option>)}
            </select>
          </Field>
        )}
        {error && <FieldError>{error}</FieldError>}
        <Button type="submit" className="self-start" disabled={pending || !strategy}>Save routing rule</Button>
      </FieldGroup>
    </form>
  )
}
