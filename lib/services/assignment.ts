import { and, eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import type { Session } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { assignmentRules, conversationHistory, conversations, notifications, roundRobinState, users } from '@/lib/db/schema'
import { emit } from '@/lib/events/bus'
import { findAccessible, type Conversation } from '@/lib/services/conversation'

export type AssignResult =
  | { ok: true; value: Conversation }
  | { ok: false; error: 'not_found' | 'forbidden' | 'invalid_agent' | 'resolved' }

export type AutoAssignRule = { strategy: 'round_robin' } | { strategy: 'manual'; manualAgentId: string }

const isActiveAgent = and(eq(users.role, 'agent'), eq(users.isActive, 1))
const activeAgent = (id: string) =>
  db.select({ id: users.id }).from(users).where(and(eq(users.id, id), isActiveAgent)).get()

// `actor` null means the system (auto-assign).
export function assign(conversationId: string, agentId: string, actor: Session | null): AssignResult {
  const conv =
    actor?.role === 'agent'
      ? findAccessible(conversationId, actor)
      : db.select().from(conversations).where(eq(conversations.id, conversationId)).get()
  if (!conv) return { ok: false, error: 'not_found' }
  // A history row on a resolved conversation would count as a second resolution in reports.
  if (conv.status === 'resolved') return { ok: false, error: 'resolved' }
  if (!activeAgent(agentId)) return { ok: false, error: 'invalid_agent' }
  // findAccessible leaves an agent only unassigned conversations or their own, so this limits agents to self-assigning.
  if (actor?.role === 'agent' && agentId !== actor.userId) return { ok: false, error: 'forbidden' }
  if (conv.assignedAgentId === agentId) return { ok: true, value: conv }

  const now = Date.now()
  const notificationId = uuid()
  const next = db.transaction((tx) => {
    tx.insert(conversationHistory)
      .values({
        id: uuid(),
        conversationId,
        fromStatus: conv.status,
        toStatus: conv.status,
        changedBy: actor?.userId ?? null,
        reason: 'assigned',
        changedAt: now,
      })
      .run()
    tx.insert(notifications).values({ id: notificationId, userId: agentId, conversationId, type: 'assigned', createdAt: now }).run()
    return tx
      .update(conversations)
      .set({ assignedAgentId: agentId, updatedAt: now })
      .where(eq(conversations.id, conversationId))
      .returning()
      .get()!
  })

  const assigned = {
    type: 'conversation.assigned',
    conversationId,
    payload: { fromAgentId: conv.assignedAgentId, toAgentId: agentId },
  } as const
  emit(assigned, agentId)
  if (conv.assignedAgentId) emit(assigned, conv.assignedAgentId)
  emit({ type: 'notification.created', conversationId, payload: { notificationId } }, agentId)
  return { ok: true, value: next }
}

export function configureAutoAssign(
  rule: AutoAssignRule,
  updatedBy: string,
): { ok: true; value: typeof assignmentRules.$inferSelect } | { ok: false; error: 'invalid_agent' } {
  const manualAgentId = rule.strategy === 'manual' ? rule.manualAgentId : null
  if (manualAgentId !== null && !activeAgent(manualAgentId)) return { ok: false, error: 'invalid_agent' }
  // One active rule: replace whatever was there.
  const value = db.transaction((tx) => {
    tx.delete(assignmentRules).run()
    return tx
      .insert(assignmentRules)
      .values({ id: uuid(), strategy: rule.strategy, manualAgentId, updatedBy, updatedAt: Date.now() })
      .returning()
      .get()
  })
  return { ok: true, value }
}

// Returns null when no rule applies.
export function autoAssign(conversationId: string): AssignResult | null {
  const rule = db.select().from(assignmentRules).where(eq(assignmentRules.isActive, 1)).get()
  if (!rule) return null
  if (rule.strategy === 'manual') return assign(conversationId, rule.manualAgentId!, null)

  const agents = db.select({ id: users.id }).from(users).where(isActiveAgent).orderBy(users.id).all()
  if (!agents.length) return null
  const last = db.select().from(roundRobinState).where(eq(roundRobinState.id, 1)).get()?.lastAssignedAgentId
  const next = (last == null ? undefined : agents.find((a) => a.id > last)) ?? agents[0]
  const result = assign(conversationId, next.id, null)
  if (result.ok) {
    const state = { lastAssignedAgentId: next.id, updatedAt: Date.now() }
    db.insert(roundRobinState).values({ id: 1, ...state }).onConflictDoUpdate({ target: roundRobinState.id, set: state }).run()
  }
  return result
}
