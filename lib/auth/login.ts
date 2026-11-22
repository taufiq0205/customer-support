import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { verifyPassword } from '@/lib/auth/passwords'
import type { Session } from '@/lib/auth/session'

// Cost-12 hash of a random discarded value, so unknown usernames take as long as wrong passwords.
const DUMMY_HASH = '$2a$12$6Cq3va4vzoV2cLTfHjo9HuhZBW8FfSuaJB9ouWPTMrIJW/8Si1mZ.'

export async function authenticate(username: string, password: string): Promise<Session | null> {
  const user = db.select().from(users).where(eq(users.username, username)).get()
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !ok || user.isActive === 0) return null
  return { userId: user.id, role: user.role }
}
