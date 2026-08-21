import type { Ledger } from '@/lib/stats/ledger'
import type { SeasonData } from '@/lib/domain/types'
import { isk, teamName } from '../lib/format'

const RANK_COLOR = ['text-money', 'text-ink', 'text-ink'] as const

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
          <p className="mt-3 rounded border border-warn-line/60 bg-warn-bg px-3 py-2 text-sm font-medium text-warn-ink">
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
        <div className="rounded-lg border border-warn-line border-l-4 bg-warn-bg p-4 text-sm font-medium text-warn-ink">
          <strong className="font-display text-base font-semibold">Hypothetical.</strong>{' '}
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
          {/*
            Money renders statically, and nothing on this page animates a
            number any more. This page gets screenshotted into a group chat;
            a mid-animation frame showing the wrong ISK total is exactly the
            misread the money-legibility constraint forbids, so the correct
            total is on screen from the very first paint.
          */}
          <p className="font-display text-4xl font-semibold tabular-nums text-money sm:text-5xl">
            {isk.format(ledger.totalPaid)} ISK
          </p>
        </div>
        <div className="text-sm text-muted">
          {ledger.gameweeksCounted} of {season.regularSeasonPeriods} gameweeks counted
          {ledger.periodsWithheld > 0 && (
            <span className="mt-1 block rounded border border-warn-line/60 bg-warn-bg px-2 py-1 font-medium text-warn-ink">
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
            <col className="w-9" />
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
                  className={`py-2.5 pl-3 pr-1 font-semibold tabular-nums ${RANK_COLOR[i] ?? 'text-muted'}`}
                >
                  {i + 1}
                </td>
                <td className="min-w-0 py-2.5 pr-2">
                  <span className="flex min-w-0 items-center gap-2.5">
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
                <td className="whitespace-nowrap py-2.5 pr-2 text-right tabular-nums">{e.gameweekWins}</td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-right font-semibold tabular-nums text-money">
                  {isk.format(e.isk)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
