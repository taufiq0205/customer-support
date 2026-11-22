import type { Channel } from './types'

// The single owner of how tolerant adapters are with undocumented payload variants. Pure: no I/O.

// The message names the field and never includes payload content.
export class AdapterPayloadError extends Error {
  name = 'AdapterPayloadError'
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message)
  }
}

export type PayloadErrorClass = new (field: string, message: string) => AdapterPayloadError

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// First value that is not undefined or null among dotted paths. Own properties only.
export function pick(obj: unknown, paths: readonly string[]): unknown {
  for (const path of paths) {
    let cur: unknown = obj
    for (const key of path.split('.')) {
      cur = isRecord(cur) && Object.hasOwn(cur, key) ? cur[key] : undefined
      if (cur === undefined || cur === null) break
    }
    if (cur !== undefined && cur !== null) return cur
  }
  return undefined
}

// Reads one required field; the error names the field and the paths tried, never the value.
export function required<T>(
  obj: unknown,
  field: string,
  paths: readonly string[],
  coerce: (v: unknown) => T | null,
  Err: PayloadErrorClass,
): T {
  const raw = pick(obj, paths)
  const value = coerce(raw)
  if (value !== null) return value
  const problem = raw === undefined ? 'is missing' : `has an unusable ${Array.isArray(raw) ? 'array' : typeof raw} value`
  throw new Err(field, `Field "${field}" ${problem} (looked in ${paths.join(', ')})`)
}

// True when any path holds a non-empty array or an object.
export const hasAny = (obj: unknown, paths: readonly string[]) =>
  paths.some((p) => {
    const v = pick(obj, [p])
    return Array.isArray(v) ? v.length > 0 : isRecord(v)
  })

export function parseObject(raw: string, Err: PayloadErrorClass): Record<string, unknown> {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    throw new Err('payload', 'Webhook payload is not valid JSON')
  }
  if (!isRecord(v) || Array.isArray(v)) throw new Err('payload', 'Webhook payload is not an object')
  return v
}

export function toId(v: unknown): string | null {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? String(v) : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length > 0 && s.isWellFormed() ? s : null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/
const NUMERIC = /^\d+(\.\d+)?$/

export function toDate(v: unknown): Date | null {
  const s = typeof v === 'string' ? v.trim() : null
  const n = typeof v === 'number' ? v : s !== null && NUMERIC.test(s) ? Number(s) : null
  let ms: number
  if (n !== null) ms = n > 1e12 ? n : n * 1000 // above 1e12 is ms, otherwise s
  else if (s !== null && ISO_DATE.test(s)) ms = Date.parse(s)
  else return null
  if (!(ms > 0)) return null
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d
}

const DIRECTIONS: Record<string, 'inbound' | 'outbound'> = {
  inbound: 'inbound',
  incoming: 'inbound',
  received: 'inbound',
  in: 'inbound',
  outbound: 'outbound',
  outgoing: 'outbound',
  sent: 'outbound',
  out: 'outbound',
  echo: 'outbound',
}

export function toDirection(v: unknown): 'inbound' | 'outbound' | null {
  if (typeof v !== 'string') return null
  const key = v.trim().toLowerCase()
  return Object.hasOwn(DIRECTIONS, key) ? DIRECTIONS[key] : null
}

// Matched per token so `online` never matches `line`; covers provider prefixes like twilio_whatsapp.
const CHANNEL_TOKENS: Record<string, Channel> = {
  whatsapp: 'whatsapp',
  wa: 'whatsapp',
  messenger: 'facebook',
  facebook: 'facebook',
  fb: 'facebook',
  instagram: 'instagram',
  ig: 'instagram',
  line: 'line',
  shopee: 'shopee',
  lazada: 'lazada',
  tiktok: 'tiktok',
  widget: 'widget',
  webchat: 'widget',
  livechat: 'widget',
  website: 'widget',
}

export function toChannel(v: unknown): Channel | null {
  if (typeof v !== 'string') return null
  const token = v
    .trim()
    .toLowerCase()
    .split(/[\s._-]+/)
    .find((t) => Object.hasOwn(CHANNEL_TOKENS, t))
  return token ? CHANNEL_TOKENS[token] : null
}

export const normalizeEventType = (v: unknown): string | null =>
  typeof v === 'string' ? v.trim().toLowerCase().replaceAll('_', '.') : null
