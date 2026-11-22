export type SSEEventType =
  | 'conversation.created'
  | 'conversation.updated'
  | 'message.created'
  | 'conversation.assigned'
  | 'conversation.status_changed'
  | 'notification.created'

export interface SSEEvent {
  type: SSEEventType
  conversationId: string
  payload: Record<string, unknown>
}
