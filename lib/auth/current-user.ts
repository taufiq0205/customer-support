import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Session } from './session'

// proxy.ts verifies the cookie and sets x-auth-user; it strips any client-sent copy.
export async function currentUser(): Promise<Session> {
  try {
    const { userId, role } = JSON.parse((await headers()).get('x-auth-user') ?? '')
    if (typeof userId === 'string' && (role === 'agent' || role === 'supervisor')) return { userId, role }
  } catch {}
  redirect('/login')
}
