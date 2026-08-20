import type { Ledger } from '@/lib/stats/ledger'
import type { SeasonData } from '@/lib/domain/types'
import { isk, teamName } from '../lib/format'

export function GameweekHistory({
  season,
  ledger,
  hypothetical,
}: {
  season: SeasonData
  ledger: Ledger
  hypothetical: boolean
}) {
  if (ledger.gameweeks.length === 0) return null

  const teamLogo = (id: string) =>
    season.teams.find((t) => t.teamId === id)?.logoUrl ?? null

  // Most recent gameweek first: the interesting one is the latest.
  const rows = [...ledger.gameweeks].reverse()

  return (
    <details className="mt-6 rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3 font-display text-sm font-bold uppercase tracking-wide text-foreground">
        Gameweek by gameweek{' '}
        <span className="text-muted">({ledger.gameweeks.length})</span>
        {hypothetical && (
          <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
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
            <col className="w-10" />
            <col />
            <col className="w-14" />
            <col className="w-16" />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="py-2 pl-4 pr-2 font-medium">
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
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.period} className="border-b border-line/60 last:border-b-0">
                <td className="py-2 pl-4 pr-2 font-display font-bold tabular-nums text-muted">
                  {g.period}
                </td>
                <td className="min-w-0 py-2 pr-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {g.winners.map((id) => (
                      <span key={id} className="flex items-center gap-1.5">
                        {teamLogo(id) && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={teamLogo(id)!}
                            alt=""
                            className="h-4 w-4 shrink-0 rounded-sm object-cover"
                          />
                        )}
                        {teamName(season, id)}
                      </span>
                    ))}
                    {g.winners.length > 1 && (
                      <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-muted">
                        tie, split
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{g.topScore}</td>
                <td className="py-2 pr-4 text-right font-medium tabular-nums text-gold">
                  {isk.format(g.iskPerWinner)}
                  {g.winners.length > 1 && ' ea'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
