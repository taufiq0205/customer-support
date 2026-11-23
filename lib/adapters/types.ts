// Adapters import only this file and the standard library; never lib/db or services.

export const PLATFORMS = ['zaapi', 'respond_io', 'telegram'] as const
export type Platform = (typeof PLATFORMS)[number]

// Mirrors the conversations.channel enum in lib/db/schema.ts.
export const CHANNELS = ['whatsapp', 'facebook', 'instagram', 'line', 'shopee', 'lazada', 'tiktok', 'widget', 'telegram'] as const
export type Channel = (typeof CHANNELS)[number]

export interface IncomingMessage {
  externalId: string // platform-assigned message ID
  externalConversationId: string
  platform: Platform
  channel: Channel
  direction: 'inbound' | 'outbound'
  senderName: string | null
  body: string | null
  hasAttachment: boolean
  sentAt: Date
}

export interface OutboundReply {
  conversationId: string // internal ID
  // Adapters cannot read the DB, so the caller passes the platform's conversation ID.
  externalConversationId: string
  body: string
}

// Zaapi returns no message id; its outbound copy arrives later via the message.sent webhook.
// unconfirmed: the request may have reached the platform (timeout, network error, HTTP 5xx); only the echo webhook settles it.
// failed: the platform definitely did not send (missing key, invalid input, HTTP 4xx).
export type SendResult =
  | { status: 'sent'; externalMessageId: string | null }
  | { status: 'unconfirmed'; errorMessage: string }
  | { status: 'failed'; errorMessage: string }

export interface WebhookVerificationResult {
  valid: boolean
  rawPayload: string // the route logs metadata only; never persist this when valid is false
}

export interface PlatformAdapter {
  verifyWebhook(req: Request): Promise<WebhookVerificationResult>
  parseWebhook(rawPayload: string): Promise<IncomingMessage[]>
  sendReply(reply: OutboundReply): Promise<SendResult>
}
