'use client'

import { useActionState } from 'react'
import { login } from './actions'

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, { error: '' })

  return (
    <form action={formAction}>
      <label htmlFor="username">Username</label>
      <input id="username" name="username" type="text" autoComplete="username" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <p role="alert" aria-live="polite">{state.error}</p>
      <button type="submit" disabled={pending}>Sign in</button>
    </form>
  )
}
