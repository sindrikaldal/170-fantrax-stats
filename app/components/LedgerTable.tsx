import type { Ledger } from '@/lib/stats/ledger'
import type { SeasonData } from '@/lib/domain/types'
import { teamName } from '../lib/format'
import { CountUp } from './CountUp'

const RANK_COLOR = ['text-gold', 'text-foreground', 'text-foreground'] as const

export function LedgerTable({
  season,
  ledger,
  hypothetical,
}: {
  season: SeasonData
  ledger: Ledger
  hypothetical: boolean
}) {
  const teamLogo = (id: string) =>
    season.teams.find((t) => t.teamId === id)?.logoUrl ?? null

  if (ledger.gameweeksCounted === 0) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-line bg-surface p-6">
        <p className="text-sm text-muted">
          No gameweeks have finished yet. The ledger fills in from gameweek 1.
        </p>
        {ledger.periodsWithheld > 0 && (
          <p className="mt-3 rounded border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm font-medium text-amber-200">
            {ledger.periodsWithheld} gameweek{ledger.periodsWithheld === 1 ? '' : 's'}{' '}
            {ledger.periodsWithheld === 1 ? 'has' : 'have'} ended but{' '}
            {ledger.periodsWithheld === 1 ? 'is' : 'are'} still awaiting final scores from
            Fantrax, so {ledger.periodsWithheld === 1 ? 'it is' : 'they are'} not counted yet.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {hypothetical && (
        <div className="rounded-lg border border-amber-600 bg-amber-950 p-4 text-sm font-semibold text-amber-100">
          <span className="font-display font-extrabold uppercase tracking-wide text-amber-300">
            Hypothetical.
          </span>{' '}
          The gameweek prize did not exist in {season.seasonYear}. These figures show what the
          rule <em>would</em> have paid. Nobody owes anybody anything.
        </div>
      )}

      {/* Hero total: the number everyone actually cares about. */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Paid out so far
          </p>
          <p className="font-display text-4xl font-extrabold tabular-nums text-gold sm:text-5xl">
            <CountUp value={ledger.totalPaid} format="isk" /> ISK
          </p>
        </div>
        <div className="text-sm text-muted">
          {ledger.gameweeksCounted} of {season.regularSeasonPeriods} gameweeks counted
          {ledger.periodsWithheld > 0 && (
            <span className="mt-1 block rounded border border-amber-700/50 bg-amber-950/40 px-2 py-1 font-medium text-amber-200">
              {ledger.periodsWithheld} more gameweek{ledger.periodsWithheld === 1 ? '' : 's'}{' '}
              {ledger.periodsWithheld === 1 ? 'is' : 'are'} complete but still awaiting final
              scores from Fantrax.
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            {season.seasonYear} gameweek prize ledger, ranked by ISK earned.
          </caption>
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-14" />
            <col className="w-20" />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="py-2 pl-3 pr-1 font-medium">
                #
              </th>
              <th scope="col" className="py-2 pr-2 font-medium">
                Team
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">
                GW
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                ISK
              </th>
            </tr>
          </thead>
          <tbody>
            {ledger.entries.map((e, i) => (
              <tr key={e.teamId} className="border-b border-line/60 last:border-b-0">
                <td
                  className={`py-2 pl-3 pr-1 font-display font-bold tabular-nums ${RANK_COLOR[i] ?? 'text-muted'}`}
                >
                  {i + 1}
                </td>
                <td className="min-w-0 py-2 pr-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {teamLogo(e.teamId) && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={teamLogo(e.teamId)!}
                        alt=""
                        className="h-5 w-5 shrink-0 rounded-sm object-cover"
                      />
                    )}
                    <span className="min-w-0 truncate">{teamName(season, e.teamId)}</span>
                  </span>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{e.gameweekWins}</td>
                <td className="py-2 pr-3 text-right font-display font-bold tabular-nums text-gold">
                  <CountUp value={e.isk} format="isk" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
