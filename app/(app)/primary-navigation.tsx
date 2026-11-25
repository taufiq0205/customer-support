'use client'

import { ChartColumnIcon, InboxIcon, SettingsIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Role } from '@/lib/auth/session'

export function PrimaryNavigation({ role }: { role: Role }) {
  const pathname = usePathname()
  const links = [
    { href: '/inbox', label: 'Inbox', icon: InboxIcon },
    ...(role === 'supervisor' ? [
      { href: '/reports', label: 'Supervisor Desk', icon: ChartColumnIcon },
      { href: '/settings', label: 'Settings', icon: SettingsIcon },
    ] : []),
  ]

  return (
    <nav
      aria-label="Primary navigation"
      className="shrink-0 border-b bg-card md:w-60 md:border-b-0 md:border-r"
    >
      <ul className={cn('grid md:flex md:flex-col md:gap-1 md:p-3', links.length === 1 ? 'grid-cols-1' : 'grid-cols-3')}>
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  buttonVariants({ variant: active ? 'secondary' : 'ghost' }),
                  'h-auto min-h-14 w-full flex-col gap-1 px-1 py-2 text-[11px] md:min-h-9 md:flex-row md:justify-start md:gap-2 md:px-3 md:text-sm',
                  active && 'bg-accent text-accent-foreground',
                )}
              >
                <Icon aria-hidden="true" data-icon="inline-start" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
