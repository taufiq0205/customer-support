import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/auth/session'

process.env.DATABASE_URL = ':memory:'
const { parseConversationQuery } = await import('@/lib/services/conversation')

const agent: Session = { userId: 'agent-a', role: 'agent' }
const parse = (query: string) => parseConversationQuery(new URLSearchParams(query), agent)

describe('parseConversationQuery', () => {
  it('maps assignedTo=me to the session user and unassigned to null', () => {
    expect(parse('assignedTo=me').filters.assignedAgentId).toBe('agent-a')
    expect(parse('assignedTo=unassigned').filters.assignedAgentId).toBeNull()
    expect(parse('assignedTo=agent-b').filters.assignedAgentId).toBe('agent-b')
    expect(parse('assignedTo=').filters).not.toHaveProperty('assignedAgentId')
  })

  it('keeps valid enums and search', () => {
    expect(parse('status=open&platform=zaapi&channel=line&search=box&page=9:x')).toEqual({
      filters: { status: 'open', platform: 'zaapi', channel: 'line', search: 'box', cursor: '9:x' },
      invalidField: undefined,
    })
  })

  it('drops an invalid enum value and names the first invalid field', () => {
    expect(parse('status=closed&platform=zaapi&channel=fax')).toEqual({
      filters: { platform: 'zaapi', search: undefined, cursor: undefined },
      invalidField: 'status',
    })
  })
})
