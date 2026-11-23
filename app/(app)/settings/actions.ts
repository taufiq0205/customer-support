'use server'

import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/current-user'
import { aiSettingsView, parseAISettings, saveAISettings } from '@/lib/services/ai-settings'

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
