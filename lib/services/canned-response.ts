import { and, asc, eq, ne } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '@/lib/db'
import { cannedResponses } from '@/lib/db/schema'

export type CannedResponse = typeof cannedResponses.$inferSelect
export type CannedResponseInput = Pick<CannedResponse, 'name' | 'shortcode' | 'body'>
export type CannedResponseResult =
  | { ok: true; value: CannedResponse }
  | { ok: false; error: 'not_found' | 'duplicate_shortcode' }

export function list(): CannedResponse[] {
  return db.select().from(cannedResponses).orderBy(asc(cannedResponses.shortcode)).all()
}

// Filtering in JS keeps `%`, `_` and `\` literal and lowercases non-ASCII, which SQLite's LIKE and lower() do not.
// shortcut: loads the whole library per keystroke, fine for a few hundred responses; move to SQL if it grows past that.
export function searchByPrefix(prefix: string): CannedResponse[] {
  const lower = prefix.toLowerCase()
  return list().filter((r) => r.shortcode.toLowerCase().startsWith(lower))
}

const shortcodeTaken = (shortcode: string, exceptId?: string) =>
  !!db
    .select({ id: cannedResponses.id })
    .from(cannedResponses)
    .where(and(eq(cannedResponses.shortcode, shortcode), exceptId ? ne(cannedResponses.id, exceptId) : undefined))
    .get()

export function create(input: CannedResponseInput, createdBy: string): CannedResponseResult {
  if (shortcodeTaken(input.shortcode)) return { ok: false, error: 'duplicate_shortcode' }
  const now = Date.now()
  const value = db
    .insert(cannedResponses)
    .values({ id: uuid(), ...input, createdBy, createdAt: now, updatedAt: now })
    .returning()
    .get()
  return { ok: true, value }
}

export function update(id: string, input: CannedResponseInput): CannedResponseResult {
  if (!db.select({ id: cannedResponses.id }).from(cannedResponses).where(eq(cannedResponses.id, id)).get()) {
    return { ok: false, error: 'not_found' }
  }
  if (shortcodeTaken(input.shortcode, id)) return { ok: false, error: 'duplicate_shortcode' }
  const value = db
    .update(cannedResponses)
    .set({ ...input, updatedAt: Date.now() })
    .where(eq(cannedResponses.id, id))
    .returning()
    .get()!
  return { ok: true, value }
}

// Returns false when no response has this id.
export function remove(id: string): boolean {
  return db.delete(cannedResponses).where(eq(cannedResponses.id, id)).run().changes > 0
}
