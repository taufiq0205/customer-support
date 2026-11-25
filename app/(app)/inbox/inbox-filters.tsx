'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CHANNELS, PLATFORMS } from '@/lib/adapters/types'
import { CHANNEL_LABELS, inboxHref, PLATFORM_LABELS, STATUS_LABELS } from './labels'

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
const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

// Filters live in the URL; the inbox page re-renders on the server for each change.
export function InboxFilters({ values }: { values: Record<string, string | string[] | undefined> }) {
  const router = useRouter()
  const searchInput = useRef<HTMLInputElement>(null)
  const search = firstValue(values.search) ?? ''
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const input = searchInput.current
    if (input && !timer.current && input.value.trim() !== search) input.value = search
  }, [search])

  const update = (param: string, value: string | null) => {
    const params = new URLSearchParams(window.location.search)
    if (value) params.set(param, value)
    else params.delete(param)
    params.delete('page')
    router.replace(inboxHref(params))
  }

  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <Input
        type="search"
        aria-label="Search conversations"
        placeholder="Search name, identifier or message"
        ref={searchInput}
        defaultValue={search}
        className="col-span-2 w-full"
        onChange={(e) => {
          const value = e.target.value.trim()
          clearTimeout(timer.current)
          timer.current = setTimeout(() => {
            timer.current = undefined
            update('search', value)
          }, SEARCH_DEBOUNCE_MS)
        }}
      />
      {FILTERS.map(({ param, label, items }) => {
        const value = firstValue(values[param])
        return (
          <Select
            key={param}
            items={items}
            value={items.some((i) => i.value === value) ? value ?? null : null}
            onValueChange={(value) => update(param, value)}
          >
            <SelectTrigger aria-label={label} className="w-full min-w-0">
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
        )
      })}
    </div>
  )
}
