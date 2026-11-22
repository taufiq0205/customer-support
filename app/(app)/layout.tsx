import { eq } from 'drizzle-orm'
import { InboxIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { currentUser } from '@/lib/auth/current-user'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { AppProvider, LogoutButton, NotificationBadge } from './app-provider'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await currentUser()
  const user = db.select({ displayName: users.displayName }).from(users).where(eq(users.id, session.userId)).get()

  return (
    <AppProvider session={session}>
      <div className="flex h-svh flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <span className="font-heading font-semibold">CX Support</span>
          <Separator orientation="vertical" className="mx-2 h-5" />
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" render={<Link href="/inbox" />} nativeButton={false}>
              <InboxIcon data-icon="inline-start" />
              Inbox
            </Button>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBadge />
            <span className="text-sm">{user?.displayName ?? session.userId}</span>
            <Badge variant="secondary">{session.role}</Badge>
            <LogoutButton />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </AppProvider>
  )
}
