import type { CannedResponseInput } from '@/lib/services/canned-response'

// Shared by POST and PUT; both take the full record.
export async function parseInput(request: Request): Promise<CannedResponseInput | null> {
  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null) return null
  const { name, shortcode, body: text } = body as Record<string, unknown>
  if (typeof name !== 'string' || !name.trim() || typeof text !== 'string' || !text.trim()) return null
  // The compose picker stops matching at the first whitespace, so a shortcode with spaces could never be found.
  if (typeof shortcode !== 'string' || !/^\S+$/.test(shortcode)) return null
  return { name: name.trim(), shortcode, body: text }
}
