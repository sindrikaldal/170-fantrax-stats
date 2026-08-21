import { notFound } from 'next/navigation'
import { SEASON_YEARS } from '@/config/leagues'
import { computeLedger } from '@/lib/stats/ledger'
import { loadAllSeasonViews, loadSeasonView } from '@/app/lib/season-view'
import { managerIndex } from '@/app/lib/manager-view'
import { resolveManagers } from '@/lib/stats/managers'
import { headToHeadMatrix, nemesisAndBunny, revengeFixtures } from '@/lib/stats/rivalries'
import { LedgerTable } from '@/app/components/LedgerTable'
import { GameweekHistory } from '@/app/components/GameweekHistory'
import { SectionHeader } from '@/app/components/SectionHeader'
import { EmptyState } from '@/app/components/EmptyState'
import { AlternateTables } from '@/app/components/luck/AlternateTables'
import { LuckIndex } from '@/app/components/luck/LuckIndex'
import { ScheduleSwap } from '@/app/components/luck/ScheduleSwap'
import { CloseGames } from '@/app/components/luck/CloseGames'
import { ThresholdTrend } from '@/app/components/luck/ThresholdTrend'
import { H2HMatrix } from '@/app/components/rivalries/H2HMatrix'
import { NemesisBunny } from '@/app/components/rivalries/NemesisBunny'
import { RevengeWeek } from '@/app/components/rivalries/RevengeWeek'

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

  // Rivalries are cross-season: a nemesis earned in 2025 is still a nemesis
  // on the 2026 page, so this section reads every season we can load rather
  // than the one being viewed. `loadSeason` fetches are deduped within a
  // render, so re-reading the current year here costs nothing.
  const allViews = await loadAllSeasonViews(now)
  const seasons = allViews.map((v) => v.season)
  const resolution = resolveManagers(seasons)
  const managers = [...managerIndex(resolution, seasons).values()]
  const matrix = headToHeadMatrix(seasons, resolution, now)
  const verdicts = nemesisAndBunny(matrix)
  const revenge = revengeFixtures(seasons, resolution, now)
  const rivalryYears = allViews.map((v) => v.year).join(' + ')

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

      <section id="rivalries" className="mt-14 space-y-10">
        <SectionHeader
          title="Rivalries"
          subtitle={`${rivalryYears} combined — some beatings are personal.`}
        />
        {matrix.length === 0 ? (
          <EmptyState
            needed={1}
            have={0}
            what="Rivalries need a meeting that has actually happened"
          />
        ) : (
          <>
            <H2HMatrix matrix={matrix} managers={managers} />
            <NemesisBunny verdicts={verdicts} matrix={matrix} managers={managers} />
          </>
        )}
        <RevengeWeek fixtures={revenge} managers={managers} />
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
