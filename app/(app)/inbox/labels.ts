import type { Channel, Platform } from '@/lib/adapters/types'
import type { Message, Status } from '@/lib/services/conversation'

export const PLATFORM_LABELS: Record<Platform, string> = { zaapi: 'Zaapi', respond_io: 'respond.io' }

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  line: 'LINE',
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiktok: 'TikTok',
  widget: 'Web widget',
}

export const STATUS_LABELS: Record<Status, string> = { open: 'Open', snoozed: 'Snoozed', resolved: 'Resolved' }

export const DELIVERY_LABELS: Record<Message['status'], string> = {
  pending: 'Pending',
  sent: 'Sent',
  unconfirmed: 'Unconfirmed',
  failed: 'Failed',
  delivered: 'Delivered',
}

const timestamp = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
export const formatTime = (ms: number) => timestamp.format(ms)
