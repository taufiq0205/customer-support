'use client'

import { LogOutIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Session } from '@/lib/auth/session'
import type { SSEEvent } from '@/lib/events/types'

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside AppProvider')
  return session
}

const REFRESH_DELAY_MS = 250

const refreshes = (type: SSEEvent['type']) => type.startsWith('conversation.') || type === 'message.created'

// One SSE connection for the whole app. Events re-render the current route's Server Components,
// so the inbox and thread pages stay current without their own subscriptions.
export function AppProvider({ session, children }: { session: Session; children: ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const source = new EventSource('/api/events')
    let timer: ReturnType<typeof setTimeout> | undefined
    let dropped = false
    const refresh = () => {
      timer ??= setTimeout(() => {
        timer = undefined
        router.refresh()
      }, REFRESH_DELAY_MS)
    }
    source.onmessage = (e) => {
      try {
        if (refreshes((JSON.parse(e.data) as SSEEvent).type)) refresh()
      } catch {}
    }
    source.onerror = () => {
      dropped = true
    }
    // EventSource reconnects on its own; refetch to fill whatever was missed while it was down.
    source.onopen = () => {
      if (dropped) refresh()
      dropped = false
    }
    return () => {
      clearTimeout(timer)
      source.close()
    }
  }, [router])

  return <SessionContext value={session}>{children}</SessionContext>
}

export function LogoutButton() {
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    // A full load drops the client router cache of protected pages.
    window.location.assign('/login')
  }
  return (
    <Button variant="ghost" size="sm" onClick={logout}>
      <LogOutIcon data-icon="inline-start" />
      Log out
    </Button>
  )
}
