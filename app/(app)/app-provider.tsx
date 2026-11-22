'use client'

import { BellIcon, LogOutIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Session } from '@/lib/auth/session'
import type { SSEEvent } from '@/lib/events/types'

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside AppProvider')
  return session
}

export type Notification = { id: string; conversationId: string; type: 'assigned' | 'message'; createdAt: number }
type Notifications = { unread: Notification[]; markRead: (ids: string[]) => void }

const NotificationsContext = createContext<Notifications | null>(null)

export function useNotifications(): Notifications {
  const notifications = useContext(NotificationsContext)
  if (!notifications) throw new Error('useNotifications must be used inside AppProvider')
  return notifications
}

const REFRESH_DELAY_MS = 250

const refreshes = (type: SSEEvent['type']) => type.startsWith('conversation.') || type === 'message.created'

// One SSE connection for the whole app. Events re-render the current route's Server Components,
// so the inbox and thread pages stay current without their own subscriptions.
export function AppProvider({ session, children }: { session: Session; children: ReactNode }) {
  const router = useRouter()
  const [unread, setUnread] = useState<Notification[]>([])

  const loadNotifications = useCallback(() => {
    fetch('/api/notifications')
      .then((res) => (res.ok ? (res.json() as Promise<Notification[]>) : null))
      .then((list) => list && setUnread(list))
      .catch(() => {})
  }, [])

  const markRead = useCallback((ids: string[]) => {
    setUnread((current) => current.filter((n) => !ids.includes(n.id)))
    fetch('/api/notifications', { method: 'PATCH', body: JSON.stringify({ ids }) }).catch(() => {})
  }, [])

  useEffect(() => {
    loadNotifications()
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
        const { type } = JSON.parse(e.data) as SSEEvent
        if (refreshes(type)) refresh()
        if (type === 'notification.created') loadNotifications()
      } catch {}
    }
    source.onerror = () => {
      dropped = true
    }
    // EventSource reconnects on its own; refetch to fill whatever was missed while it was down.
    source.onopen = () => {
      if (dropped) {
        refresh()
        loadNotifications()
      }
      dropped = false
    }
    return () => {
      clearTimeout(timer)
      source.close()
    }
  }, [router, loadNotifications])

  return (
    <SessionContext value={session}>
      <NotificationsContext value={{ unread, markRead }}>{children}</NotificationsContext>
    </SessionContext>
  )
}

// unread is newest first, so the bell opens the latest conversation the agent was handed.
export function NotificationBadge() {
  const { unread } = useNotifications()
  const router = useRouter()
  const count = unread.length
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={count === 0}
      aria-label={count === 0 ? 'No unread notifications' : `${count} unread notification${count === 1 ? '' : 's'}`}
      onClick={() => router.push(`/inbox/${encodeURIComponent(unread[0].conversationId)}`)}
    >
      <BellIcon />
      {count > 0 && <Badge>{count}</Badge>}
    </Button>
  )
}

// Opening a thread means the agent has seen its notifications.
export function ClearConversationNotifications({ conversationId }: { conversationId: string }) {
  const { unread, markRead } = useNotifications()
  useEffect(() => {
    const ids = unread.filter((n) => n.conversationId === conversationId).map((n) => n.id)
    if (ids.length > 0) markRead(ids)
  }, [unread, conversationId, markRead])
  return null
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
