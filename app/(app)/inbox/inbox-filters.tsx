'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CHANNELS, PLATFORMS } from '@/lib/adapters/types'
import { CHANNEL_LABELS, PLATFORM_LABELS, STATUS_LABELS } from './labels'

type Option = { label: string; value: string | null }

const FILTERS: { param: string; label: string; items: Option[] }[] = [
  {
    param: 'assignedTo',
    label: 'Assignment',
    items: [
      { label: 'All conversations', value: null },
      { label: 'Assigned to me', value: 'me' },
      { label: 'Unassigned', value: 'unassigned' },
    ],
  },
  {
    param: 'status',
    label: 'Status',
    items: [
      { label: 'Any status', value: null },
      ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value })),
    ],
  },
  {
    param: 'platform',
    label: 'Platform',
    items: [{ label: 'All platforms', value: null }, ...PLATFORMS.map((p) => ({ label: PLATFORM_LABELS[p], value: p }))],
  },
  {
    param: 'channel',
    label: 'Channel',
    items: [{ label: 'All channels', value: null }, ...CHANNELS.map((c) => ({ label: CHANNEL_LABELS[c], value: c }))],
  },
]

const SEARCH_DEBOUNCE_MS = 300

// Filters live in the URL; the inbox page re-renders on the server for each change.
export function InboxFilters({ values }: { values: Record<string, string> }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const update = (param: string, value: string | null) => {
    const params = new URLSearchParams(window.location.search)
    if (value) params.set(param, value)
    else params.delete(param)
    params.delete('page')
    router.replace(`/inbox?${params}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        aria-label="Search conversations"
        placeholder="Search name, identifier or message"
        defaultValue={values.search ?? ''}
        className="w-72"
        onChange={(e) => {
          const value = e.target.value.trim()
          clearTimeout(timer.current)
          timer.current = setTimeout(() => update('search', value), SEARCH_DEBOUNCE_MS)
        }}
      />
      {FILTERS.map(({ param, label, items }) => (
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
                <SelectItem key={item.label} value={item.value}>
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
