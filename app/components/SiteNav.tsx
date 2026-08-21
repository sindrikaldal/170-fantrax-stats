'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SEASON_YEARS } from '@/config/leagues'

const links = [
  { href: '/', label: 'Home' },
  ...SEASON_YEARS.map((year) => ({ href: `/season/${year}`, label: String(year) })),
]

/** Site navigation: home plus every season page. */
export function SiteNav() {
  const pathname = usePathname()

  // The login page is the one route reachable without the password, and every
  // link here goes somewhere that needs it — showing the nav there would just
  // offer a row of redirects back to the form.
  if (pathname === '/login') return null

  return (
    <nav className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
      <div className="container-page flex gap-1 overflow-x-auto">
        {links.map((link) => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-3.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-money text-ink'
                  : 'border-transparent text-muted hover:text-ink'
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
