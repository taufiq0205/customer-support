const ERROR_MESSAGES: Record<string, string> = {
  ai_not_configured: 'AI suggestions are not configured.',
  not_found: 'This conversation is no longer available to you.',
  unauthorized: 'Your session has expired. Sign in again to get a suggestion.',
}
const FALLBACK = 'Could not get a suggestion. You can still type a reply.'
const NETWORK = 'Could not reach the server. Check your connection and try again.'

export async function requestSuggestion(conversationId: string): Promise<{ suggestion: string } | { error: string }> {
  let res: Response
  try {
    res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/ai-suggest`, { method: 'POST' })
  } catch {
    return { error: NETWORK }
  }
  const json = (await res.json().catch(() => null)) as { suggestion?: unknown; errorMessage?: unknown; error?: unknown } | null
  if (res.ok && typeof json?.suggestion === 'string') return { suggestion: json.suggestion }
  if (typeof json?.errorMessage === 'string') return { error: json.errorMessage }
  return { error: (typeof json?.error === 'string' && ERROR_MESSAGES[json.error]) || FALLBACK }
}
