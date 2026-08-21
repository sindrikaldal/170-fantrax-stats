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
import { RecordsWall } from '@/app/components/records/RecordsWall'
import { FormTable } from '@/app/components/records/FormTable'
import { BoomOrBust } from '@/app/components/records/BoomOrBust'
import { PowerRankings } from '@/app/components/records/PowerRankings'

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

  // A season that fails to load must degrade, not 500. The front page
  // already treats a failed load this way; without the same guard here the
  // season page threw straight through to Next's error boundary, losing
  // the masthead, the nav and the cross-season rivalries that do not
  // depend on this season at all.
  let view: Awaited<ReturnType<typeof loadSeasonView>> | null = null
  try {
    view = await loadSeasonView(year, now)
  } catch (err) {
    console.error(`Failed to load season ${year}:`, err)
  }
  const ledger = view ? computeLedger(view.season, now) : null
  const loaded = view && ledger ? { view, ledger } : null

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
  // "2025 + 2026 combined" is only true when more than one season loaded;
  // if one failed, saying "2025 combined" is both wrong and confusing.
  const years = allViews.map((v) => v.year)
  const rivalryScope = years.length > 1 ? `${years.join(' + ')} combined` : String(years[0] ?? year)

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

      {!loaded ? (
        <p className="rounded-lg border border-down/40 bg-surface p-4 text-sm text-down">
          {year} data is temporarily unavailable. The rivalry history below spans every
          season that did load.
        </p>
      ) : (
        <>
          <section>
            <SectionHeader title="Ledger" subtitle="Gameweek prize winners." />
            <LedgerTable
              season={loaded.view.season}
              ledger={loaded.ledger}
              hypothetical={loaded.view.hypothetical}
            />
            <GameweekHistory
              season={loaded.view.season}
              ledger={loaded.ledger}
              hypothetical={loaded.view.hypothetical}
            />
          </section>

          {/*
            Wide-screen pairing: close games and the threshold trend are both
            supporting blocks and read fine at half width, so they share a row
            from lg up rather than each running the full 1200px alone. The
            alternate tables and the schedule-swap cards handle their own
            internal columns.
          */}
          <section id="luck" className="mt-14 space-y-10">
            <SectionHeader title="Luck vs. Skill" subtitle="Who earned it, who fluked it." />
            <AlternateTables view={loaded.view} now={now} />
            <LuckIndex view={loaded.view} now={now} />
            <ScheduleSwap view={loaded.view} now={now} />
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-6">
              <CloseGames view={loaded.view} now={now} />
              <ThresholdTrend view={loaded.view} now={now} />
            </div>
          </section>
        </>
      )}

      <section id="rivalries" className="mt-14 space-y-10">
        <SectionHeader
          title="Rivalries"
          subtitle={`${rivalryScope} — some beatings are personal.`}
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

      {/*
        Form and power answer the same question from two angles — who is
        good right now — so they share a row on wide screens. The records
        wall and the boom-or-bust strips both want full width: the wall is
        already a three-column grid, and the strips only stay comparable on
        one long shared scale.
      */}
      {loaded && (
        <section id="records" className="mt-14 space-y-10">
          <SectionHeader
            title="Records &amp; Power"
            subtitle="The wall of fame and shame."
          />
          <RecordsWall view={loaded.view} now={now} />
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-6">
            <FormTable view={loaded.view} now={now} />
            <PowerRankings view={loaded.view} now={now} />
          </div>
          <BoomOrBust view={loaded.view} now={now} />
        </section>
      )}
    </main>
  )
}
