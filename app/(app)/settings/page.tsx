import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { currentUser } from '@/lib/auth/current-user'
import { aiSettingsView } from '@/lib/services/ai-settings'
import { currentAutoAssignRule, listActiveAgents } from '@/lib/services/assignment'
import { AutoAssignmentForm } from './auto-assignment-form'
import { CannedResponsesPanel } from './canned-responses-panel'
import { AISettingsForm } from './ai-settings-form'

export default async function SettingsPage() {
  const session = await currentUser()
  if (session.role !== 'supervisor') redirect('/inbox')

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <Card id="reply-suggestions">
          <CardHeader>
            <CardTitle>Reply Suggestion Provider</CardTitle>
            <CardDescription>The OpenAI-compatible endpoint that drafts reply suggestions. Changes apply at once.</CardDescription>
          </CardHeader>
          <CardContent>
            <AISettingsForm initial={{ ...aiSettingsView(), saved: false }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Auto-assignment</CardTitle>
            <CardDescription>Route new conversations to the next active agent or a specific agent.</CardDescription>
          </CardHeader>
          <CardContent>
            <AutoAssignmentForm rule={currentAutoAssignRule()} agents={listActiveAgents()} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Canned responses</CardTitle>
          <CardDescription>Agents can insert these in a reply by typing a slash followed by the shortcode.</CardDescription>
        </CardHeader>
        <CardContent>
          <CannedResponsesPanel />
        </CardContent>
      </Card>
    </div>
  )
}
