import Link from 'next/link'

/**
 * Themed 404 for invalid season years (or any unmatched route). The
 * built-in Next.js default renders with a hardcoded white background,
 * which breaks the "dark everywhere" invariant this app commits to.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-cold">
        170 Broskis
      </p>
      <h1 className="mt-4 font-display text-6xl font-extrabold uppercase tracking-tight text-foreground sm:text-7xl">
        4<span className="text-gold">0</span>4
      </h1>
      <p className="mt-4 text-muted">
        Nothing here. Maybe try a season that actually happened.
      </p>
      <Link
        href="/"
        className="mt-8 rounded border border-line px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-foreground hover:border-gold hover:text-gold"
      >
        Back to Home
      </Link>
    </main>
  )
}
