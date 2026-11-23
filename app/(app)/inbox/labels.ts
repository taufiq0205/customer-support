import type { Channel, Platform } from '@/lib/adapters/types'
import type { Message, Status } from '@/lib/services/conversation'

export const PLATFORM_LABELS: Record<Platform, string> = { zaapi: 'Zaapi', respond_io: 'respond.io', telegram: 'Telegram' }

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  line: 'LINE',
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiktok: 'TikTok',
  widget: 'Web widget',
  telegram: 'Telegram',
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

// Two largest units, e.g. 4m 5s or 2d 3h; an em dash when there is nothing to average.
export function formatDuration(ms: number | null) {
  if (ms === null) return '—'
  const s = Math.round(ms / 1000)
  const [m, h, d] = [Math.floor(s / 60), Math.floor(s / 3600), Math.floor(s / 86400)]
  if (s < 60) return `${s}s`
  if (m < 60) return `${m}m ${s % 60}s`
  if (h < 24) return `${h}h ${m % 60}m`
  return `${d}d ${h % 24}h`
}
