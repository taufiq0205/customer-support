import { getSession } from '@/lib/auth/session'
import { addClient, removeClient } from '@/lib/events/bus'

const KEEPALIVE_MS = 30_000
const KEEPALIVE = new TextEncoder().encode(': keepalive\n\n')

export async function GET(request: Request) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const id = crypto.randomUUID()
  let timer: ReturnType<typeof setInterval> | undefined
  // Idempotent: cancel() and the abort signal can both fire for one disconnect.
  const cleanup = () => {
    clearInterval(timer)
    removeClient(id)
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addClient(id, controller, session.userId, session.role)
      // Headers only flush with the first chunk; without it EventSource.onopen waits for the first event.
      controller.enqueue(KEEPALIVE)
      timer = setInterval(() => {
        try { controller.enqueue(KEEPALIVE) } catch { cleanup() }
      }, KEEPALIVE_MS)
      request.signal.addEventListener('abort', cleanup, { once: true })
    },
    cancel: cleanup,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
