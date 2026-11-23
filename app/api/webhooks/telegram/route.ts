import { telegramAdapter } from '@/lib/adapters/telegram'
import { handleWebhook } from '@/lib/services/webhook'

export const POST = (req: Request) => handleWebhook('telegram', telegramAdapter, req)
