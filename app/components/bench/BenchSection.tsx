import type { SeasonView } from '../../lib/season-view'
import type { BenchReport } from '@/lib/stats/bench'
import {formatScore, isk} from '../../lib/format'
import { TeamCrest } from '../TeamCrest'
import { TeamName } from '../TeamName'
import { BenchHistory } from './BenchHistory'

/**
 * The whole "Left on the bench" section body: two headline cards and the
 * week-by-week list. There is deliberately no per-team season table —
 * season totals of regret are the least interesting number here, and the
 * week-by-week stories are the point.
 *
 * Lineups come from committed snapshots that a daily job captures, so the
 * section has its own notion of coverage — "through GW N" — separate from
 * how many gameweeks the ledger has settled, and says so when they differ.
 */
export function BenchSection({ view, report }: { view: SeasonView; report: BenchReport }) {
  const { season, hypothetical } = view

  if (report.periods.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Bench regret needs captured lineups
        </p>
        <p className="mt-2 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {report.missingPeriods.length > 0
            ? `${report.missingPeriods.length} settled gameweek${report.missingPeriods.length === 1 ? '' : 's'} not captured yet.`
            : 'Nothing to regret until a gameweek has been played.'}{' '}
          <span className="text-money">Patience.</span>
        </p>
        {report.missingPeriods.length > 0 && (
          <p className="mt-2 text-sm text-muted">Lineups are captured once a day.</p>
        )}
      </div>
    )
  }

  const biggestWeek = report.rows.reduce((best, r) => (r.regret > best.regret ? r : best), report.rows[0])
  const benched = report.entries.filter((e) => e.iskBenched > 0).sort((a, b) => b.iskBenched - a.iskBenched)
  const totalBenched = benched.reduce((s, e) => s + e.iskBenched, 0)
  const totalPrizes = benched.reduce((s, e) => s + e.wouldHaveTakenPrizes, 0)
  const coverage = `through GW${report.throughPeriod}${
    report.inProgressPeriods.length > 0
      ? ` · GW${report.inProgressPeriods.join(', GW')} in progress`
      : ''
  }${
    report.missingPeriods.length > 0
      ? ` · ${report.missingPeriods.length} settled gameweek${report.missingPeriods.length === 1 ? '' : 's'} not captured yet`
      : ''
  }`

  return (
    <div className="space-y-6">
      {hypothetical && (
        <div className="rounded-lg border border-warn-line border-l-4 bg-warn-bg p-4 text-sm font-medium text-warn-ink">
          <strong className="font-display text-base font-semibold">Hypothetical.</strong> The
          gameweek prize did not exist in {season.seasonYear}, so the ISK here is doubly imaginary:
          a prize that was not on offer, for a lineup that was not fielded.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Worst single week
          </p>
          <p className="mt-2 font-display text-4xl font-semibold tabular-nums text-analysis">
            {formatScore(biggestWeek.regret)}
          </p>
          <div className="mt-3 flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
            <TeamCrest season={season} teamId={biggestWeek.teamId} />
            <span className="min-w-0 truncate"><TeamName season={season} teamId={biggestWeek.teamId} /></span>
          </div>
          <p className="mt-1 text-sm text-muted">
            GW{biggestWeek.period}
            {biggestWeek.shouldHaveStarted[0] &&
              ` — ${biggestWeek.shouldHaveStarted[0].name} scored ${formatScore(biggestWeek.shouldHaveStarted[0].points)} from the bench`}
            {biggestWeek.wouldHaveTakenPrize && ', and it would have taken the prize'}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Prize money benched
          </p>
          <p className="mt-2 font-display text-4xl font-semibold tabular-nums text-analysis">
            {isk.format(totalBenched)} ISK
          </p>
          <p className="mt-3 text-sm font-medium text-ink">
            {totalPrizes} gameweek prize{totalPrizes === 1 ? '' : 's'} a better lineup would have
            taken, {coverage}
          </p>
          {benched.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
              {benched.map((e) => (
                <li key={e.teamId} className="flex items-center gap-1.5">
                  <TeamCrest season={season} teamId={e.teamId} size="h-4 w-4" />
                  <span className="truncate"><TeamName season={season} teamId={e.teamId} /></span>
                  <span className="tabular-nums text-analysis">{isk.format(e.iskBenched)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            Priced at {isk.format(report.prizePerGameweek)} ISK per gameweek, against everyone
            else&rsquo;s actual scores. Nobody was owed any of it.
          </p>
        </div>
      </div>

      <BenchHistory season={season} report={report} />
    </div>
  )
}
