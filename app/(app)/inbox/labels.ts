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

const CHANNEL_COLORS: Record<Channel, string> = {
  whatsapp: 'bg-green-100 text-green-900',
  facebook: 'bg-indigo-100 text-indigo-900',
  instagram: 'bg-pink-100 text-pink-900',
  line: 'bg-emerald-100 text-emerald-900',
  shopee: 'bg-orange-100 text-orange-900',
  lazada: 'bg-violet-100 text-violet-900',
  tiktok: 'bg-slate-200 text-slate-900',
  widget: 'bg-teal-100 text-teal-900',
  telegram: 'bg-sky-100 text-sky-900',
}

export function channelPresentation(channel: Channel) {
  return Object.hasOwn(CHANNEL_LABELS, channel)
    ? { label: CHANNEL_LABELS[channel], className: CHANNEL_COLORS[channel] }
    : { label: 'Unknown channel', className: '' }
}

export const platformLabel = (platform: Platform) =>
  Object.hasOwn(PLATFORM_LABELS, platform) ? PLATFORM_LABELS[platform] : 'Unknown platform'

export const statusLabel = (status: Status) =>
  Object.hasOwn(STATUS_LABELS, status) ? STATUS_LABELS[status] : 'Unknown status'

export const caseLabel = (id: string) => `#${id.slice(0, 8)}`

export function inboxQuery(searchParams: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    for (const entry of [value ?? []].flat()) query.append(key, entry)
  }
  return query
}

export function inboxHref(query: URLSearchParams, id?: string) {
  const path = id === undefined ? '/inbox' : `/inbox/${encodeURIComponent(id)}`
  const search = query.toString()
  return search ? `${path}?${search}` : path
}

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
