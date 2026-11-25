export type AccessLoss = 'session' | 'case'
export type SendError = { message: string; duplicate: boolean; access?: AccessLoss }

export type SendState = { kind: 'idle' } | { kind: 'sending' } | ({ kind: 'error'; submitted: string } & SendError)

const ERROR_MESSAGES: Record<string, string> = {
  invalid_body: 'Type a reply before sending.',
  not_found: 'This conversation is no longer available to you.',
  unauthorized: 'Your session has expired. Sign in again to send.',
  unconfirmed_duplicate: 'An earlier copy of this reply was never confirmed and may already have reached the customer.',
}
const FALLBACK = 'The reply could not be sent.'
const NETWORK = 'Could not reach the server. Check your connection and try again.'

// Resolves to null once the server accepts the reply; delivery status then arrives over SSE.
export async function sendReply(conversationId: string, body: string, confirmResend = false): Promise<SendError | null> {
  let res: Response
  try {
    res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(confirmResend ? { body, confirmResend } : { body }),
    })
  } catch {
    return { message: NETWORK, duplicate: false }
  }
  if (res.ok) return null
  const code = ((await res.json().catch(() => null)) as { error?: unknown } | null)?.error
  return {
    message: (typeof code === 'string' && ERROR_MESSAGES[code]) || FALLBACK,
    duplicate: code === 'unconfirmed_duplicate',
    ...(res.status === 401 && { access: 'session' }),
    ...((res.status === 403 || code === 'not_found') && { access: 'case' }),
  }
}
