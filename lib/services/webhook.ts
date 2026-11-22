import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { AdapterPayloadError } from '@/lib/adapters/lenient'
import type { Platform, PlatformAdapter } from '@/lib/adapters/types'
import { ZaapiLookupError } from '@/lib/adapters/zaapi'
import { db } from '@/lib/db'
import { webhookLog } from '@/lib/db/schema'
import { ingest } from '@/lib/services/conversation'

// Name and field only: an error message can echo payload content.
function errorLabel(err: unknown): string {
  const name = err instanceof Error ? err.name : 'UnknownError'
  const field = err instanceof AdapterPayloadError || err instanceof ZaapiLookupError ? err.field : undefined
  return field ? `${name}.${field}` : name
}

// Logs metadata only and never stores the payload; response bodies stay empty.
export async function handleWebhook(platform: Platform, adapter: PlatformAdapter, req: Request): Promise<Response> {
  const id = uuid()
  db.insert(webhookLog).values({ id, platform, receivedAt: Date.now() }).run()
  const finish = (status: number, set: Partial<typeof webhookLog.$inferInsert>) => {
    db.update(webhookLog).set(set).where(eq(webhookLog.id, id)).run()
    return new Response(null, { status })
  }

  // An unreadable body cannot be verified, so it is rejected like a bad signature.
  const { valid, rawPayload } = await adapter.verifyWebhook(req).catch(() => ({ valid: false, rawPayload: '' }))
  if (!valid) return finish(401, { processingStatus: 'rejected' })
  try {
    ingest(await adapter.parseWebhook(rawPayload))
    return finish(200, { verified: 1, processingStatus: 'processed' })
  } catch (err) {
    // A failed Zaapi lookup is transient, so 503 asks Zaapi to retry.
    const status = err instanceof ZaapiLookupError ? 503 : 500
    return finish(status, { verified: 1, processingStatus: 'failed', errorMessage: errorLabel(err) })
  }
}
