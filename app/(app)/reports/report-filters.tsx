'use client'

import { useRouter } from 'next/navigation'
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
    <div className="flex flex-wrap items-center gap-2">
      {/* Keyed by value so a range the server fell back from shows what is actually reported. */}
      <Input
        key={`from-${values.from}`}
        type="date"
        aria-label="From"
        className="w-40"
        defaultValue={values.from}
        max={values.to}
        onChange={(e) => update('from', e.target.value)}
      />
      <Input
        key={`to-${values.to}`}
        type="date"
        aria-label="To"
        className="w-40"
        defaultValue={values.to}
        min={values.from}
        onChange={(e) => update('to', e.target.value)}
      />
      {filters.map(({ param, label, items }) => (
        <Select
          key={param}
          items={items}
          defaultValue={items.some((i) => i.value === values[param]) ? values[param] : null}
          onValueChange={(value) => update(param, value)}
        >
          <SelectTrigger aria-label={label}>
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
      ))}
    </div>
  )
}
