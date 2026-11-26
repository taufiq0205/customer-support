import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'

export function UnavailablePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-dashed bg-muted/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-heading text-sm font-medium">{title}</h2>
        <Badge variant="outline">Not connected</Badge>
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
    </section>
  )
}
