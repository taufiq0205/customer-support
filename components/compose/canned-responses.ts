import type { CannedResponse } from '@/lib/services/canned-response'

// Lives here, not in the service, because the service imports the database and this runs in the browser.
// split/join, not replaceAll: a replacement string expands `$&` and `$'`, which a customer name may contain.
export const substitutePlaceholder = (body: string, customerName: string) => body.split('{{customer_name}}').join(customerName)

// `/gre` → `gre`; null once the text holds whitespace or does not start with `/`.
export const shortcodeQuery = (text: string) => /^\/(\S*)$/.exec(text)?.[1] ?? null

// The picker is a convenience, so any failure shows no suggestions instead of an error.
export async function fetchCannedResponses(prefix: string): Promise<CannedResponse[]> {
  try {
    const res = await fetch(`/api/canned-responses?prefix=${encodeURIComponent(prefix)}`)
    return res.ok ? await res.json() : []
  } catch {
    return []
  }
}
