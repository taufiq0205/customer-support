import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { currentUser } from '@/lib/auth/current-user'
import { aiSettingsView } from '@/lib/services/ai-settings'
import { AISettingsForm } from './ai-settings-form'

export default async function SettingsPage() {
  const session = await currentUser()
  if (session.role !== 'supervisor') redirect('/inbox')

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-4">
      <h1 className="font-heading text-lg font-semibold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>AI suggestions</CardTitle>
          <CardDescription>The OpenAI-compatible endpoint that drafts reply suggestions. Changes apply at once.</CardDescription>
        </CardHeader>
        <CardContent>
          <AISettingsForm initial={{ ...aiSettingsView(), saved: false }} />
        </CardContent>
      </Card>
    </div>
  )
}
