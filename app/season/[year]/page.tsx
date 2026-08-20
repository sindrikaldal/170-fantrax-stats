import { notFound } from 'next/navigation'
import { SEASON_YEARS } from '@/config/leagues'
import { computeLedger } from '@/lib/stats/ledger'
import { loadSeasonView } from '@/app/lib/season-view'
import { LedgerTable } from '@/app/components/LedgerTable'
import { GameweekHistory } from '@/app/components/GameweekHistory'
import { SectionHeader } from '@/app/components/SectionHeader'
import { EmptyState } from '@/app/components/EmptyState'

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ year: string }>
}) {
  const { year: yearParam } = await params
  const year = Number(yearParam)

  // Only years we actually have a league configured for are real routes;
  // everything else (typos, future/past guesses) is a genuine 404, not a
  // silent empty page.
  if (!Number.isInteger(year) || !SEASON_YEARS.includes(year)) notFound()

  const now = new Date()
  const view = await loadSeasonView(year, now)
  const ledger = computeLedger(view.season, now)
  const settledCount = view.settled.length

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8 border-b border-line pb-4">
        <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-cold">
          Season
        </p>
        <h1 className="mt-1 font-display text-4xl font-extrabold uppercase tracking-tight text-foreground sm:text-5xl">
          {year}
        </h1>
      </header>

      <section>
        <SectionHeader title="Ledger" subtitle="Gameweek prize winners." />
        <LedgerTable season={view.season} ledger={ledger} hypothetical={view.hypothetical} />
        <GameweekHistory season={view.season} ledger={ledger} hypothetical={view.hypothetical} />
      </section>

      {/* Placeholder anchors for tasks 16-18: luck & schedule-luck stats,
          h2h/nemesis/bunny/revenge, and blowout/collapse/boom-bust records.
          EmptyState is presentational only — whether to show it is on us,
          so a season with enough settled gameweeks gets an honest "not
          built yet" placeholder instead of a nonsensical "needs 0 more". */}
      <section id="luck" className="mt-12">
        <SectionHeader title="Luck" subtitle="Who's earning it, who's owed it." />
        <SectionPlaceholder needed={6} have={settledCount} what="Luck needs a sample." />
      </section>

      <section id="rivalries" className="mt-12">
        <SectionHeader title="Rivalries" subtitle="Nemesis, bunny, revenge fixtures." />
        <SectionPlaceholder needed={2} have={settledCount} what="Rivalries need history." />
      </section>

      <section id="records" className="mt-12">
        <SectionHeader title="Records" subtitle="Blowouts, collapses, boom-or-bust." />
        <SectionPlaceholder needed={8} have={settledCount} what="Records need games played." />
      </section>
    </main>
  )
}

/**
 * Wraps EmptyState with the have>=needed gating that later tasks 16-18
 * will replace with real stat components. Until then, a season with
 * enough settled gameweeks shows an honest "not built yet" note rather
 * than a wrong "needs 0 more gameweeks" message.
 */
function SectionPlaceholder({
  needed,
  have,
  what,
}: {
  needed: number
  have: number
  what: string
}) {
  if (have < needed) {
    return <EmptyState needed={needed} have={have} what={what} />
  }
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface/50 p-6 text-center text-sm text-muted">
      Coming soon.
    </div>
  )
}
