import { parseArgs } from 'node:util'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db, runMigrations } from '../lib/db'
import { users } from '../lib/db/schema'
import { hashPassword } from '../lib/auth/passwords'

const ROLES = ['agent', 'supervisor'] as const
type Role = (typeof ROLES)[number]

export async function seedUser(input: {
  username: string
  password: string
  role: string
  displayName?: string
}) {
  const { username, password, role, displayName } = input
  if (!username || !password) throw new Error('username and password are required')
  if (!ROLES.includes(role as Role)) throw new Error(`invalid role "${role}" (use agent or supervisor)`)
  runMigrations()
  if (db.select().from(users).where(eq(users.username, username)).get()) {
    throw new Error(`username "${username}" already exists`)
  }
  const id = uuid()
  db.insert(users)
    .values({
      id,
      username,
      passwordHash: await hashPassword(password),
      displayName: displayName || username,
      role: role as Role,
      createdAt: Date.now(), // epoch ms per design.md
    })
    .run()
  return { id, username, role: role as Role }
}

// Run only when executed directly, not when imported by tests.
if (process.argv[1] && path.basename(process.argv[1]) === 'seed-users.ts') {
  const { values } = parseArgs({
    options: {
      username: { type: 'string' },
      password: { type: 'string' },
      role: { type: 'string' },
      'display-name': { type: 'string' },
    },
  })
  seedUser({
    username: values.username ?? '',
    password: values.password ?? '',
    role: values.role ?? '',
    displayName: values['display-name'],
  }).then(
    (u) => console.log(`Created ${u.role} "${u.username}" (${u.id})`),
    (e: Error) => {
      console.error(`seed-users: ${e.message}`)
      process.exit(1)
    },
  )
}
