import type { Role } from '@/lib/auth/session'
import type { SSEEvent } from './types'

type Controller = ReadableStreamDefaultController<Uint8Array>

const clients = new Map<string, { controller: Controller; userId: string; role: Role }>()

export function addClient(id: string, controller: Controller, userId: string, role: Role) {
  clients.set(id, { controller, userId, role })
}

export function removeClient(id: string) {
  clients.delete(id)
}

export function emit(event: SSEEvent, visibleToUserId?: string) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  const bytes = new TextEncoder().encode(data)
  for (const [, client] of clients) {
    // Supervisors receive all events; agents receive events for accessible conversations only
    if (visibleToUserId === undefined || client.role === 'supervisor' || client.userId === visibleToUserId) {
      try { client.controller.enqueue(bytes) } catch { /* client disconnected */ }
    }
  }
}
