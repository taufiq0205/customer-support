import { currentUser } from '@/lib/auth/current-user'
import { InboxQueue } from './inbox-queue'

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [session, params] = await Promise.all([currentUser(), searchParams])

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <InboxQueue searchParams={params} session={session} />
      <div className="hidden min-w-0 items-center justify-center bg-muted/20 p-8 text-center lg:flex">
        <p className="max-w-sm text-sm text-muted-foreground">Select a case to view its conversation.</p>
      </div>
    </div>
  )
}
