import type { SeasonData } from '@/lib/domain/types'
import type { RunnerUpReport } from '@/lib/stats/runnerUp'
import { formatScore, isk, teamName } from '../lib/format'
import { TeamCrest } from './TeamCrest'
import { TeamName } from './TeamName'

/**
 * Who finished one place off the gameweek prize, and how often.
 *
 * Deliberately a separate card from the ledger table, with its ISK figure in
 * the analysis accent rather than the money accent: this is what a team
 * *missed*, never what anybody is owed, and the two must not be confusable
 * in a group-chat screenshot.
 */
export function RunnerUpCard({
  season,
  report,
  hypothetical,
}: {
  season: SeasonData
  report: RunnerUpReport
  hypothetical: boolean
}) {
  if (report.gameweeks.length === 0) return null

  return (
    <div className="mt-6 rounded-lg border border-line bg-surface">
      <div className="flex flex-col gap-1 border-b border-line px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
          One place off the money
        </h3>
        <p className="text-xs text-muted sm:text-right">
          Second-highest score each gameweek. Nothing here was ever owed
          {hypothetical && (
            <>
              {' '}
              &mdash; and in {season.seasonYear} the prize{' '}
              <span className="font-semibold text-warn-ink">did not exist</span>
            </>
          )}
          .
        </p>
      </div>
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">
          {season.seasonYear} runner-up finishes: how often each team posted the second-highest
          score of a gameweek, and the prize they were one place off.
        </caption>
        <colgroup>
          <col />
          <col className="w-12" />
          <col className="w-16 sm:w-20" />
          <col className="hidden sm:table-column sm:w-20" />
          <col className="w-20 sm:w-24" />
        </colgroup>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pl-4 pr-2 font-medium">
              Team
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">
              2nd
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">
              Closest
            </th>
            <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell">
              Pts short
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Missed
            </th>
          </tr>
        </thead>
        <tbody>
          {report.entries.map((e) => (
            <tr key={e.teamId} className="border-b border-line/60 last:border-b-0">
              <td className="min-w-0 py-2.5 pl-4 pr-2">
                <span className="flex min-w-0 items-center gap-2.5">
                  <TeamCrest season={season} teamId={e.teamId} />
                  <span className="min-w-0 truncate" title={teamName(season, e.teamId)}>
                    <TeamName season={season} teamId={e.teamId} />
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap py-2.5 pr-2 text-right font-semibold tabular-nums">
                {e.finishes}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-2 text-right tabular-nums text-ink">
                &minus;{formatScore(e.narrowestMiss)}
              </td>
              <td className="hidden whitespace-nowrap py-2.5 pr-2 text-right tabular-nums text-muted sm:table-cell">
                &minus;{formatScore(e.totalPointsShort)}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-4 text-right font-semibold tabular-nums text-analysis">
                {isk.format(e.iskOnePlaceOff)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
        <span className="font-medium text-ink">Closest</span> is the narrowest gap to that week&rsquo;s
        winner. <span className="font-medium text-ink">Missed</span> counts the full{' '}
        {isk.format(report.prizePerGameweek)} ISK for every second place, tie or not.
      </p>
    </div>
  )
}
