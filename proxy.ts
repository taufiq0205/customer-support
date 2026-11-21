import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createSession, getSession } from '@/lib/auth/session'

const PUBLIC_PATHS = ['/login', '/api/auth/login']

export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.delete('x-auth-user')

  const { pathname } = request.nextUrl
  const session = await getSession(request)

  if (!session) {
    if (PUBLIC_PATHS.includes(pathname)) {
      return NextResponse.next({ request: { headers } })
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  headers.set('x-auth-user', JSON.stringify({ userId: session.userId, role: session.role }))
  const response = NextResponse.next({ request: { headers } })
  response.headers.append('Set-Cookie', await createSession(session.userId, session.role))
  return response
}

export const config = {
  matcher: ['/((?!api/webhooks(?:/|$)|_next/static|_next/image|favicon.ico).*)'],
}
