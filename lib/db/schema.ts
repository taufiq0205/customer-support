import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['agent', 'supervisor'] }).notNull(),
  createdAt: integer('created_at').notNull(),
  isActive: integer('is_active').notNull().default(1),
})

export const platformConfigs = sqliteTable('platform_configs', {
  id: text('id').primaryKey(),
  platform: text('platform', { enum: ['zaapi', 'respond_io'] }).notNull(),
  webhookSecret: text('webhook_secret'),
  isActive: integer('is_active').notNull().default(1),
})

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    externalId: text('external_id').notNull(),
    platform: text('platform', { enum: ['zaapi', 'respond_io'] }).notNull(),
    channel: text('channel', {
      enum: ['whatsapp', 'facebook', 'instagram', 'line', 'shopee', 'lazada', 'tiktok', 'widget'],
    }).notNull(),
    status: text('status', { enum: ['open', 'snoozed', 'resolved'] }).notNull().default('open'),
    snoozedUntil: integer('snoozed_until'),
    assignedAgentId: text('assigned_agent_id').references(() => users.id),
    customerName: text('customer_name'),
    customerIdentifier: text('customer_identifier'),
    unreadCount: integer('unread_count').notNull().default(0),
    lastMessageAt: integer('last_message_at'),
    lastMessagePreview: text('last_message_preview'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [unique().on(t.externalId, t.platform)],
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    externalId: text('external_id').notNull(),
    direction: text('direction', { enum: ['inbound', 'outbound'] }).notNull(),
    senderName: text('sender_name'),
    body: text('body').notNull(),
    hasAttachment: integer('has_attachment').notNull().default(0),
    status: text('status', { enum: ['pending', 'sent', 'unconfirmed', 'failed', 'delivered'] }).notNull(),
    sentAt: integer('sent_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [unique().on(t.externalId, t.conversationId)],
)

export const conversationHistory = sqliteTable('conversation_history', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  changedBy: text('changed_by').references(() => users.id),
  reason: text('reason'),
  changedAt: integer('changed_at').notNull(),
})

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  type: text('type', { enum: ['assigned', 'message'] }).notNull(),
  isRead: integer('is_read').notNull().default(0),
  createdAt: integer('created_at').notNull(),
})

export const cannedResponses = sqliteTable('canned_responses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortcode: text('shortcode').notNull().unique(),
  body: text('body').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const assignmentRules = sqliteTable('assignment_rules', {
  id: text('id').primaryKey(),
  strategy: text('strategy', { enum: ['round_robin', 'manual'] }).notNull(),
  manualAgentId: text('manual_agent_id').references(() => users.id),
  isActive: integer('is_active').notNull().default(1),
  updatedBy: text('updated_by'),
  updatedAt: integer('updated_at').notNull(),
})

export const roundRobinState = sqliteTable('round_robin_state', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lastAssignedAgentId: text('last_assigned_agent_id'),
  updatedAt: integer('updated_at').notNull(),
})

// Metadata only: raw webhook payloads are never stored.
export const webhookLog = sqliteTable('webhook_log', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull(),
  receivedAt: integer('received_at').notNull(),
  verified: integer('verified').notNull().default(0),
  processingStatus: text('processing_status', { enum: ['processed', 'failed', 'rejected'] }),
  errorMessage: text('error_message'),
})

// No PII: prompt and response text are never stored.
export const aiRequestLog = sqliteTable('ai_request_log', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id'),
  modelName: text('model_name').notNull(),
  requestedAt: integer('requested_at').notNull(),
  responseMs: integer('response_ms'),
  success: integer('success').notNull(),
  errorMessage: text('error_message'),
})

export const schema = {
  users,
  platformConfigs,
  conversations,
  messages,
  conversationHistory,
  notifications,
  cannedResponses,
  assignmentRules,
  roundRobinState,
  webhookLog,
  aiRequestLog,
}
