import { notFound } from 'next/navigation'
import { SEASON_YEARS } from '@/config/leagues'
import { computeLedger } from '@/lib/stats/ledger'
import { loadSeasonView } from '@/app/lib/season-view'
import { LedgerTable } from '@/app/components/LedgerTable'
import { GameweekHistory } from '@/app/components/GameweekHistory'
import { SectionHeader } from '@/app/components/SectionHeader'
import { EmptyState } from '@/app/components/EmptyState'
import { AlternateTables } from '@/app/components/luck/AlternateTables'
import { LuckIndex } from '@/app/components/luck/LuckIndex'
import { ScheduleSwap } from '@/app/components/luck/ScheduleSwap'
import { CloseGames } from '@/app/components/luck/CloseGames'
import { ThresholdTrend } from '@/app/components/luck/ThresholdTrend'

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
    <main className="container-page py-10 sm:py-14">
      <header className="mb-10 border-b border-line pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-analysis">
          Season
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
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
      {/*
        Wide-screen pairing: close games and the threshold trend are both
        supporting blocks and read fine at half width, so they share a row
        from lg up rather than each running the full 1200px alone. The
        alternate tables and the schedule-swap cards handle their own
        internal columns.
      */}
      <section id="luck" className="mt-14 space-y-10">
        <SectionHeader title="Luck vs. Skill" subtitle="Who earned it, who fluked it." />
        <AlternateTables view={view} now={now} />
        <LuckIndex view={view} now={now} />
        <ScheduleSwap view={view} now={now} />
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-6">
          <CloseGames view={view} now={now} />
          <ThresholdTrend view={view} now={now} />
        </div>
      </section>

      <section id="rivalries" className="mt-14">
        <SectionHeader title="Rivalries" subtitle="Nemesis, bunny, revenge fixtures." />
        <SectionPlaceholder needed={2} have={settledCount} what="Rivalries need history." />
      </section>

      <section id="records" className="mt-14">
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
    <div className="rounded-lg border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
      Coming soon.
    </div>
  )
}
