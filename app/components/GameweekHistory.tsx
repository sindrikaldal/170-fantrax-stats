import type { Ledger } from '@/lib/stats/ledger'
import type { RunnerUpReport } from '@/lib/stats/runnerUp'
import type { SeasonData } from '@/lib/domain/types'
import {formatScore, isk} from '../lib/format'
import { TeamCrest } from './TeamCrest'
import { TeamName } from './TeamName'

export function GameweekHistory({
  season,
  ledger,
  runnersUp,
  hypothetical,
}: {
  season: SeasonData
  ledger: Ledger
  runnersUp: RunnerUpReport
  hypothetical: boolean
}) {
  if (ledger.gameweeks.length === 0 && ledger.pending.length === 0) return null

  // The runner-up sits beside the winner it lost to. Same settled set as
  // the ledger, so a lookup miss only happens when every team tied.
  const runnerUpByPeriod = new Map(runnersUp.gameweeks.map((g) => [g.period, g]))

  // Most recent gameweek first: the interesting one is the latest.
  const rows = [...ledger.gameweeks].reverse()
  // Gameweeks in progress sit above the paid ones: scores are real but a
  // match may still be to play, so they show a leader, not a winner.
  const pending = [...ledger.pending].reverse()

  return (
    <details className="mt-6 rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-ink">
        Gameweek by gameweek{' '}
        <span className="text-muted">
          ({ledger.gameweeks.length}
          {pending.length > 0 && ` + ${pending.length} in progress`})
        </span>
        {hypothetical && (
          <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-warn-ink">
            &mdash; hypothetical, no money was paid
          </span>
        )}
      </summary>
      <div className="border-t border-line">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            {hypothetical
              ? `Hypothetical gameweek-by-gameweek prize breakdown for ${season.seasonYear}. No money was paid.`
              : `Gameweek-by-gameweek prize breakdown for ${season.seasonYear}.`}
          </caption>
          <colgroup>
            <col className="w-11 sm:w-14" />
            <col />
            <col className="w-14 sm:w-16" />
            <col className="w-16 sm:w-20" />
            <col className="hidden md:table-column" />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="py-2 pl-4 pr-3 font-medium">
                GW
              </th>
              <th scope="col" className="py-2 pr-2 font-medium">
                Winner
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">
                Score
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                ISK
              </th>
              <th scope="col" className="hidden py-2 pr-4 font-medium md:table-cell">
                Runner-up
              </th>
            </tr>
          </thead>
          <tbody>
            {pending.map((g) => (
              <tr key={`pending-${g.period}`} className="border-b border-line/60 bg-raised/40">
                <td className="py-2.5 pl-4 pr-3 font-semibold tabular-nums text-muted">
                  {g.period}
                </td>
                <td className="min-w-0 py-2.5 pr-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {g.leaders.map((id) => (
                      <span key={id} className="flex items-center gap-1.5">
                        <TeamCrest season={season} teamId={id} size="h-4 w-4" />
                        <TeamName season={season} teamId={id} />
                      </span>
                    ))}
                    <span className="rounded bg-raised px-1.5 py-0.5 text-xs text-analysis ring-1 ring-line">
                      in progress &middot; leading
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-muted">
                  {formatScore(g.topScore)}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-right tabular-nums text-muted">
                  &mdash;
                </td>
                <td className="hidden py-2.5 pr-4 text-muted md:table-cell">&mdash;</td>
              </tr>
            ))}
            {rows.map((g) => (
              <tr key={g.period} className="border-b border-line/60 last:border-b-0">
                <td className="py-2.5 pl-4 pr-3 font-semibold tabular-nums text-muted">
                  {g.period}
                </td>
                <td className="min-w-0 py-2.5 pr-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {g.winners.map((id) => (
                      <span key={id} className="flex items-center gap-1.5">
                        <TeamCrest season={season} teamId={id} size="h-4 w-4" />
                        <TeamName season={season} teamId={id} />
                      </span>
                    ))}
                    {g.winners.length > 1 && (
                      <span className="rounded bg-raised px-1.5 py-0.5 text-xs text-muted ring-1 ring-line">
                        tie, split
                      </span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                  {formatScore(g.topScore)}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-right font-medium tabular-nums text-money">
                  {isk.format(g.iskPerWinner)}
                  {g.winners.length > 1 && ' ea'}
                </td>
                <td className="hidden min-w-0 py-2.5 pr-4 md:table-cell">
                  {(() => {
                    const ru = runnerUpByPeriod.get(g.period)
                    if (!ru) return <span className="text-muted">&mdash;</span>
                    return (
                      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-muted">
                        {ru.runnersUp.map((id) => (
                          <span key={id} className="flex min-w-0 items-center gap-1.5">
                            <TeamCrest season={season} teamId={id} size="h-4 w-4" />
                            <span className="truncate"><TeamName season={season} teamId={id} /></span>
                          </span>
                        ))}
                        <span className="tabular-nums text-analysis">
                          &minus;{formatScore(ru.gap)}
                        </span>
                      </span>
                    )
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pending.length > 0 && (
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
            <span className="font-medium text-analysis">In progress</span> &mdash; Fantrax publishes
            scores as soon as a gameweek&rsquo;s first match kicks off. The leader is live and the
            prize is not paid until the gameweek closes.
          </p>
        )}
      </div>
    </details>
  )
}
