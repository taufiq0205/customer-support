'use client'

import { CheckIcon } from 'lucide-react'
import { useActionState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { saveAISettingsAction, type AISettingsState } from './actions'

const ERRORS: Record<string, string> = {
  endpointUrl: 'Enter an http:// or https:// URL without quotes or line breaks, or leave it blank.',
  modelName: 'The model name cannot contain quotes or line breaks.',
  apiKey: 'The API key cannot contain quotes or line breaks.',
}

export function AISettingsForm({ initial }: { initial: AISettingsState }) {
  const [state, formAction, pending] = useActionState(saveAISettingsAction, initial)
  const invalid = (field: string) => (state.field === field ? true : undefined)

  return (
    <form action={formAction}>
      <FieldGroup>
        <Field data-invalid={invalid('endpointUrl')}>
          <FieldLabel htmlFor="endpointUrl">Endpoint URL</FieldLabel>
          <Input
            id="endpointUrl"
            name="endpointUrl"
            type="url"
            placeholder="http://localhost:11434"
            defaultValue={state.endpointUrl}
            aria-invalid={invalid('endpointUrl')}
          />
          <FieldDescription>Leave blank to turn AI suggestions off.</FieldDescription>
          {invalid('endpointUrl') && <FieldError>{ERRORS.endpointUrl}</FieldError>}
        </Field>
        <Field data-invalid={invalid('modelName')}>
          <FieldLabel htmlFor="modelName">Model name</FieldLabel>
          <Input
            id="modelName"
            name="modelName"
            placeholder="deepseek-r1:7b"
            defaultValue={state.modelName}
            aria-invalid={invalid('modelName')}
          />
          {invalid('modelName') && <FieldError>{ERRORS.modelName}</FieldError>}
        </Field>
        <Field data-invalid={invalid('apiKey')}>
          <FieldLabel htmlFor="apiKey">API key</FieldLabel>
          <Input
            id="apiKey"
            name="apiKey"
            type="password"
            autoComplete="new-password"
            placeholder={state.apiKeySet ? 'A key is saved. Leave blank to keep it.' : 'No key saved'}
            aria-invalid={invalid('apiKey')}
          />
          {invalid('apiKey') && <FieldError>{ERRORS.apiKey}</FieldError>}
        </Field>
        {state.saved && (
          <Alert>
            <CheckIcon />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>New AI suggestions use these settings.</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending} className="self-start">
          {pending && <Spinner data-icon="inline-start" />}
          Save provider
        </Button>
      </FieldGroup>
    </form>
  )
}
