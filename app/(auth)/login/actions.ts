'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { authenticate } from '@/lib/auth/login'
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth/session'

export type LoginState = { error: string }

const INVALID = 'Invalid username or password'

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!username || !password) return { error: INVALID }

  try {
    const session = await authenticate(username, password)
    if (!session) return { error: INVALID }
    const token = await createSessionToken(session.userId, session.role)
    ;(await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    })
  } catch {
    // Keep internals (stack, DB errors) off the page.
    return { error: 'Sign-in failed. Try again.' }
  }
  redirect('/')
}
