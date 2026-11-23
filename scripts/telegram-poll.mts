// Pulls bot updates with getUpdates and forwards each one to the local webhook route,
// so Telegram works without exposing the 127.0.0.1-bound app to the internet.
// Run: npm run telegram:poll (with npm run dev running).
import { TELEGRAM_API_BASE_URL, TELEGRAM_SECRET_HEADER, telegramWebhookSecret } from '../lib/adapters/telegram.ts'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set in .env.local')
  process.exit(1)
}
const webhookUrl = `${process.env.APP_URL ?? 'http://127.0.0.1:3000'}/api/webhooks/telegram`
const api = (method: string, params: Record<string, unknown> = {}) =>
  fetch(`${TELEGRAM_API_BASE_URL}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).then((r) => r.json() as Promise<{ ok: boolean; result?: unknown; description?: string }>)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// getUpdates fails while a webhook is set; the two delivery modes are mutually exclusive.
const del = await api('deleteWebhook').catch(() => null)
if (!del?.ok) {
  console.error('Telegram rejected the bot token (deleteWebhook failed). Check TELEGRAM_BOT_TOKEN.')
  process.exit(1)
}
console.log(`Polling Telegram, forwarding to ${webhookUrl}`)

let offset = 0
for (;;) {
  const res = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] }).catch(() => null)
  if (!res?.ok || !Array.isArray(res.result)) {
    console.error('getUpdates failed, retrying in 3 s')
    await wait(3000)
    continue
  }
  for (const update of res.result as { update_id: number }[]) {
    const fwd = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [TELEGRAM_SECRET_HEADER]: telegramWebhookSecret(token) },
      body: JSON.stringify(update),
    }).catch(() => null)
    // Logs the update id and status only, never message content.
    console.log(`update ${update.update_id} -> ${fwd?.status ?? 'app unreachable'}`)
    if (fwd?.status === 401) {
      console.error('The app rejected the secret. Restart npm run dev after setting TELEGRAM_BOT_TOKEN.')
      process.exit(1)
    }
    // Retry only transient failures; a 500 is a payload the app cannot parse and would block the queue forever.
    if (!fwd || fwd.status === 503) {
      await wait(3000)
      break // Offset not advanced: Telegram redelivers this update on the next poll.
    }
    offset = update.update_id + 1
  }
}
