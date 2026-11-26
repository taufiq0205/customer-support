'use server'

import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/current-user'
import { aiSettingsView, parseAISettings, saveAISettings } from '@/lib/services/ai-settings'
import { configureAutoAssign, type AutoAssignRule, type currentAutoAssignRule } from '@/lib/services/assignment'

export type AISettingsState = ReturnType<typeof aiSettingsView> & { saved: boolean; field?: string }

export async function saveAISettingsAction(_prev: AISettingsState, formData: FormData): Promise<AISettingsState> {
  if ((await currentUser()).role !== 'supervisor') redirect('/inbox')

  const raw = Object.fromEntries(formData)
  const parsed = parseAISettings(raw)
  if (!parsed.ok) {
    // Echo what was typed so React's form reset does not wipe it.
    const typed = { endpointUrl: String(raw.endpointUrl ?? ''), modelName: String(raw.modelName ?? '') }
    return { ...aiSettingsView(), ...typed, saved: false, field: parsed.field }
  }
  saveAISettings(parsed.value)
  return { ...aiSettingsView(), saved: true }
}

export type AutoAssignState = {
  rule: ReturnType<typeof currentAutoAssignRule>
  error?: string
}

export async function saveAutoAssignAction(previous: AutoAssignState, formData: FormData): Promise<AutoAssignState> {
  const session = await currentUser()
  if (session.role !== 'supervisor') redirect('/inbox')

  const strategy = formData.get('strategy')
  const agentId = formData.get('agentId')
  let rule: AutoAssignRule
  if (strategy === 'round_robin') {
    rule = { strategy }
  } else if (strategy === 'manual' && typeof agentId === 'string' && agentId) {
    rule = { strategy, manualAgentId: agentId }
  } else {
    return { ...previous, error: 'Choose a routing rule and select an agent for fixed assignment.' }
  }

  const result = configureAutoAssign(rule, session.userId)
  if (!result.ok) return { ...previous, error: 'Choose an active agent.' }
  return { rule: { strategy: result.value.strategy, manualAgentId: result.value.manualAgentId } }
}
