import { sendReply, type AccessLoss, type SendState } from './send-reply'
import { requestSuggestion } from './suggest-reply'

type SuggestionState = { kind: 'idle' } | { kind: 'pending'; request: symbol } | { kind: 'error'; message: string }
type Draft = {
  text: string
  revision: number
  send: SendState
  suggestion: SuggestionState
  retries: ReadonlyMap<string, SendState>
}

const empty: Draft = { text: '', revision: 0, send: { kind: 'idle' }, suggestion: { kind: 'idle' }, retries: new Map() }

export class ReplyDrafts {
  private cases = new Map<string, { draft: Draft }>()
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  get(id: string) {
    return this.cases.get(id)?.draft ?? empty
  }

  discard(id: string) {
    if (this.cases.delete(id)) this.notify()
  }

  clear() {
    this.cases.clear()
    this.notify()
  }

  recheckAccess = async () => {
    await Promise.all([...this.cases].map(async ([id, entry]) => {
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: 'HEAD', cache: 'no-store' }).catch(() => null)
      if (this.cases.get(id) !== entry) return
      if (res?.status === 401) this.clear()
      if (res?.status === 404 || res?.status === 403) this.discard(id)
    }))
  }

  edit(id: string, text: string) {
    const entry = this.entry(id)
    const { draft } = entry
    this.update(entry, {
      ...draft, text, revision: draft.revision + 1,
      send: draft.send.kind === 'error' ? empty.send : draft.send,
      suggestion: draft.suggestion.kind === 'error' ? empty.suggestion : draft.suggestion,
    })
  }

  async send(id: string, confirmResend = false) {
    const entry = this.cases.get(id)
    if (!entry) return false
    const { text, revision, send } = entry.draft
    if (!text.trim() || send.kind === 'sending') return false
    this.update(entry, { ...entry.draft, send: { kind: 'sending' }, suggestion: empty.suggestion })
    const error = await sendReply(id, text, confirmResend)
    if (this.cases.get(id) !== entry) return false
    if (error?.access) return this.revoke(id, error.access)
    this.update(entry, {
      ...entry.draft,
      text: !error && entry.draft.revision === revision ? '' : entry.draft.text,
      send: error ? { kind: 'error', ...error, submitted: text } : empty.send,
    })
    return !error
  }

  async suggest(id: string) {
    const entry = this.entry(id)
    if (entry.draft.suggestion.kind === 'pending' || entry.draft.send.kind === 'sending') return false
    const request = Symbol()
    this.update(entry, { ...entry.draft, suggestion: { kind: 'pending', request } })
    const result = await requestSuggestion(id)
    if (this.cases.get(id) !== entry) return false
    const { draft } = entry
    if (result.access) return this.revoke(id, result.access)
    if (draft.suggestion.kind === 'pending' && draft.suggestion.request === request) {
      if ('error' in result) this.update(entry, { ...draft, suggestion: { kind: 'error', message: result.error } })
      else this.update(entry, {
        ...draft,
        text: draft.text.trim() ? `${draft.text}\n\n${result.suggestion}` : result.suggestion,
        suggestion: empty.suggestion,
      })
    }
    return false
  }

  async retry(id: string, messageId: string, body: string) {
    const entry = this.entry(id)
    const prior = entry.draft.retries.get(messageId)
    if (prior?.kind === 'sending') return false
    const pending = new Map(entry.draft.retries).set(messageId, { kind: 'sending' })
    this.update(entry, { ...entry.draft, retries: pending })
    const error = await sendReply(id, body, prior?.kind === 'error' && prior.duplicate)
    if (this.cases.get(id) !== entry) return false
    if (error?.access) return this.revoke(id, error.access)
    const retries = new Map(entry.draft.retries)
    if (error) retries.set(messageId, { kind: 'error', ...error, submitted: body })
    else retries.delete(messageId)
    this.update(entry, { ...entry.draft, retries })
    return !error
  }

  private revoke(id: string, access: AccessLoss) {
    if (access === 'session') this.clear()
    else this.discard(id)
    return true
  }

  private entry(id: string) {
    const existing = this.cases.get(id)
    if (existing) return existing
    const entry = { draft: empty }
    this.cases.set(id, entry)
    return entry
  }

  private update(entry: { draft: Draft }, draft: Draft) {
    entry.draft = draft
    this.notify()
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }
}
