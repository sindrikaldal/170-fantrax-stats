'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SEASON_YEARS } from '@/config/leagues'

const links = [
  { href: '/', label: 'Home' },
  ...SEASON_YEARS.map((year) => ({ href: `/season/${year}`, label: String(year) })),
]

/** Broadcast-tab site navigation: home plus every season page. */
export function SiteNav() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-20 border-b border-line bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-2 sm:px-4">
        {links.map((link) => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-3 font-display text-sm font-bold uppercase tracking-wide transition-colors ${
                active
                  ? 'border-gold text-foreground'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
