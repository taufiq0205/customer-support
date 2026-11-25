import { eq } from 'drizzle-orm'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { currentUser } from '@/lib/auth/current-user'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { AppProvider, LogoutButton, NotificationBadge } from './app-provider'
import { PrimaryNavigation } from './primary-navigation'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await currentUser()
  const user = db.select({ displayName: users.displayName }).from(users).where(eq(users.id, session.userId)).get()

  return (
    <AppProvider session={session}>
      <div className="flex h-svh flex-col bg-background text-foreground">
        <header className="z-10 flex min-h-16 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-6">
          <Link href="/inbox" className="min-w-0 truncate font-heading text-base font-semibold tracking-tight sm:text-lg">
            Photobook Care
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
            <NotificationBadge />
            <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="max-w-28 truncate text-xs font-medium sm:max-w-36 sm:text-sm">
                {user?.displayName ?? session.userId}
              </span>
              <Badge variant="secondary" className="capitalize">{session.role}</Badge>
            </div>
            <LogoutButton />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <PrimaryNavigation role={session.role} />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </AppProvider>
  )
}
