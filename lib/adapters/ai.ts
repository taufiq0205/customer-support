import { v4 as uuid } from 'uuid'
import { db } from '@/lib/db'
import { aiRequestLog } from '@/lib/db/schema'
import { redact } from '@/lib/services/redaction'

export type ThreadTurn = { role: 'customer' | 'agent'; content: string }

export interface AISuggestionRequest {
  conversationId: string
  thread: ThreadTurn[] // raw text; the adapter redacts, so no caller can skip redaction
  customerNames: string[]
  modelName: string
  endpointUrl: string
  apiKey?: string
}

export type AISuggestionResult = { suggestion: string } | { suggestion: null; errorMessage: string }

export interface AIAdapter {
  suggest(req: AISuggestionRequest): Promise<AISuggestionResult>
}

const TIMEOUT_MS = 10_000
const SYSTEM_PROMPT =
  'You are drafting the next reply from a Photobook customer support agent. ' +
  'Keep placeholders such as [NAME], [EMAIL], [PHONE], [ORDER] and [ADDRESS] exactly as written. ' +
  'Reply with the message text only.'
const ROLES = { customer: 'user', agent: 'assistant' } as const

// Errors are fixed strings so neither provider bodies nor thread text reach the UI or the log.
const ERRORS = {
  timeout: 'The AI endpoint did not respond within 10 seconds.',
  unreachable: 'Could not reach the AI endpoint.',
  empty: 'The AI endpoint returned no suggestion.',
  status: (status: number) => `The AI endpoint returned HTTP ${status}.`,
}

export function readAIConfig(env = process.env): { endpointUrl: string; modelName: string; apiKey?: string } | null {
  const endpointUrl = env.AI_ENDPOINT_URL?.trim()
  if (!endpointUrl) return null
  return {
    endpointUrl,
    // Matches the documented local Ollama default in .env.example.
    modelName: env.AI_MODEL_NAME?.trim() || 'deepseek-r1:7b',
    apiKey: env.AI_API_KEY?.trim() || undefined,
  }
}

async function request(req: AISuggestionRequest): Promise<AISuggestionResult> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...req.thread.map((t) => ({ role: ROLES[t.role], content: redact(t.content, req.customerNames) })),
  ]
  let res: Response
  try {
    res = await fetch(`${req.endpointUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(req.apiKey ? { authorization: `Bearer ${req.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: req.modelName, messages }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    return { suggestion: null, errorMessage: err instanceof Error && err.name === 'TimeoutError' ? ERRORS.timeout : ERRORS.unreachable }
  }
  if (!res.ok) return { suggestion: null, errorMessage: ERRORS.status(res.status) }
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null
  const content = json?.choices?.[0]?.message?.content
  // Reasoning models such as deepseek-r1 prefix their answer with a <think> block.
  const suggestion = typeof content === 'string' ? content.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : ''
  return suggestion ? { suggestion } : { suggestion: null, errorMessage: ERRORS.empty }
}

export const aiAdapter: AIAdapter = {
  async suggest(req) {
    const requestedAt = Date.now()
    const result = await request(req)
    db.insert(aiRequestLog)
      .values({
        id: uuid(),
        conversationId: req.conversationId,
        modelName: req.modelName,
        requestedAt,
        responseMs: Date.now() - requestedAt,
        success: result.suggestion === null ? 0 : 1,
        errorMessage: result.suggestion === null ? result.errorMessage : null,
      })
      .run()
    return result
  },
}
