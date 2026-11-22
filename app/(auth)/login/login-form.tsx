'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { login } from './actions'

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, { error: '' })

  return (
    <form action={formAction}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input id="username" name="username" type="text" autoComplete="username" required />
        </Field>
        <Field data-invalid={state.error ? true : undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          <p role="alert" aria-live="polite" className="text-sm text-destructive">
            {state.error}
          </p>
        </Field>
        <Button type="submit" disabled={pending}>
          Sign in
        </Button>
      </FieldGroup>
    </form>
  )
}
