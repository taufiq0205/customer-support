import { zaapiAdapter } from '@/lib/adapters/zaapi'
import { handleWebhook } from '@/lib/services/webhook'

export const POST = (req: Request) => handleWebhook('zaapi', zaapiAdapter, req)
