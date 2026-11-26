'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CHANNELS, PLATFORMS } from '@/lib/adapters/types'
import { CHANNEL_LABELS, PLATFORM_LABELS } from '../inbox/labels'

type Option = { label: string; value: string | null }

// Filters live in the URL; the reports page re-renders on the server for each change.
export function ReportFilters({
  values,
  agents,
}: {
  values: { from: string; to: string; agentId?: string; channel?: string; platform?: string }
  agents: Option[]
}) {
  const router = useRouter()
  const update = (param: string, value: string | null) => {
    const params = new URLSearchParams(window.location.search)
    if (value) params.set(param, value)
    else params.delete(param)
    router.replace(`/reports?${params}`)
  }

  const filters: { param: 'agentId' | 'channel' | 'platform'; label: string; items: Option[] }[] = [
    { param: 'agentId', label: 'Agent', items: [{ label: 'All agents', value: null }, ...agents] },
    {
      param: 'channel',
      label: 'Channel',
      items: [{ label: 'All channels', value: null }, ...CHANNELS.map((c) => ({ label: CHANNEL_LABELS[c], value: c }))],
    },
    {
      param: 'platform',
      label: 'Platform',
      items: [{ label: 'All platforms', value: null }, ...PLATFORMS.map((p) => ({ label: PLATFORM_LABELS[p], value: p }))],
    },
  ]

  return (
    <Card>
      <CardContent>
        <FieldGroup className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {/* Remount date inputs when the server returns a fallback range. */}
          <Field className="min-w-0">
            <FieldLabel htmlFor="report-from">From</FieldLabel>
            <Input
              key={values.from}
              id="report-from"
              type="date"
              className="min-w-0 bg-card"
              defaultValue={values.from}
              max={values.to}
              onChange={(e) => update('from', e.target.value)}
            />
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor="report-to">To</FieldLabel>
            <Input
              key={values.to}
              id="report-to"
              type="date"
              className="min-w-0 bg-card"
              defaultValue={values.to}
              min={values.from}
              onChange={(e) => update('to', e.target.value)}
            />
          </Field>
          {filters.map(({ param, label, items }) => (
            <Field key={param} className="min-w-0">
              <FieldLabel htmlFor={`report-${param}`}>{label}</FieldLabel>
              <Select
                items={items}
                value={items.some((i) => i.value === values[param]) ? values[param] : null}
                onValueChange={(value) => update(param, value)}
              >
                <SelectTrigger id={`report-${param}`} className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {items.map((item) => (
                      <SelectItem key={item.value ?? item.label} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ))}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
