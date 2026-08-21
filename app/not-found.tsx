import Link from 'next/link'

/**
 * Themed 404 for invalid season years (or any unmatched route). The
 * built-in Next.js default ships its own hardcoded colours, which breaks
 * the single-painted-theme invariant this app commits to.
 */
export default function NotFound() {
  return (
    <main className="container-page flex flex-col items-center py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-analysis">
        170 Broskis
      </p>
      <h1 className="mt-4 font-display text-6xl font-semibold tracking-tight text-ink sm:text-7xl">
        4<span className="text-money">0</span>4
      </h1>
      <p className="mt-4 text-muted">
        Nothing here. Maybe try a season that actually happened.
      </p>
      <Link
        href="/"
        className="mt-8 rounded border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-money hover:text-money"
      >
        Back to home
      </Link>
    </main>
  )
}
