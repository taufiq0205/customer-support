import { respondIoAdapter } from '@/lib/adapters/respond-io'
import { handleWebhook } from '@/lib/services/webhook'

export const POST = (req: Request) => handleWebhook('respond_io', respondIoAdapter, req)
