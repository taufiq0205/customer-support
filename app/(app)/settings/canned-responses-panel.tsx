'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { CannedResponse, CannedResponseInput } from '@/lib/services/canned-response'

const endpoint = '/api/canned-responses'

export function CannedResponsesPanel() {
  const [responses, setResponses] = useState<CannedResponse[] | null>(null)
  const [editing, setEditing] = useState<CannedResponse | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error()
        setResponses(await response.json())
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not load canned responses. Reload to try again.')
      })
    return () => controller.abort()
  }, [])

  async function changeResponse(method: 'POST' | 'PUT' | 'DELETE', id?: string, input?: CannedResponseInput) {
    setPending(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(id ? `${endpoint}/${encodeURIComponent(id)}` : endpoint, {
        method,
        ...(input && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
      })
      if (!response.ok) {
        if (response.status === 409) setError('That shortcode is already in use.')
        else if (response.status === 404) setError('This response no longer exists. Reload to refresh the list.')
        else if (response.status === 400) setError('Enter a name, a shortcode without spaces, and a response body.')
        else setError('Could not update canned responses. Check your session and try again.')
        return false
      }

      if (method === 'DELETE') {
        setResponses((current) => (current ?? []).filter((item) => item.id !== id))
        if (editing?.id === id) setEditing(null)
        setNotice('Response deleted.')
      } else {
        const saved: CannedResponse = await response.json()
        setResponses((current) => [...(current ?? []).filter((item) => item.id !== saved.id), saved]
          .sort((a, b) => a.shortcode.localeCompare(b.shortcode)))
        setEditing(null)
        setNotice('Response saved.')
      }
      return true
    } catch {
      setError('Could not update canned responses. Try again.')
      return false
    } finally {
      setPending(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const saved = await changeResponse(editing ? 'PUT' : 'POST', editing?.id, {
      name: String(data.get('name')),
      shortcode: String(data.get('shortcode')),
      body: String(data.get('body')),
    })
    if (saved) form.reset()
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <FieldError>{error}</FieldError>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {responses === null ? (
        !error && <p role="status" className="text-sm text-muted-foreground">Loading responses…</p>
      ) : (
        <>
          {responses.length === 0 && <p className="text-sm text-muted-foreground">No canned responses yet.</p>}
          {responses.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {responses.map((response) => (
                <li key={response.id} className="flex flex-col gap-2 p-3">
                  <p className="font-medium break-words">{response.name} <code className="text-muted-foreground">/{response.shortcode}</code></p>
                  <p className="whitespace-pre-wrap break-words text-sm">{response.body}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={`Edit ${response.name}`}
                      onClick={() => { setEditing(response); setError(''); setNotice('') }}>Edit</Button>
                    <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={`Delete ${response.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete “${response.name}” (/${response.shortcode})?`)) {
                          void changeResponse('DELETE', response.id)
                        }
                      }}>Delete</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form key={editing?.id ?? 'new'} onSubmit={save}>
            <FieldGroup>
              <h3 className="font-medium">{editing ? `Edit ${editing.name}` : 'Add a canned response'}</h3>
              <Field>
                <FieldLabel htmlFor="response-name">Name</FieldLabel>
                <Input id="response-name" name="name" defaultValue={editing?.name} disabled={pending} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="response-shortcode">Shortcode</FieldLabel>
                <Input id="response-shortcode" name="shortcode" defaultValue={editing?.shortcode} disabled={pending} required />
                <FieldDescription>Enter the shortcode without the leading slash.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="response-body">Body</FieldLabel>
                <Textarea id="response-body" name="body" defaultValue={editing?.body} disabled={pending} required />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pending}>Save response</Button>
                {editing && <Button type="button" variant="outline" disabled={pending}
                  onClick={() => { setEditing(null); setError('') }}>Cancel edit</Button>}
              </div>
            </FieldGroup>
          </form>
        </>
      )}
    </div>
  )
}
