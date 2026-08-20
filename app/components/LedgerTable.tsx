import type { Ledger } from '@/lib/stats/ledger'
import type { SeasonData } from '@/lib/domain/types'

const isk = new Intl.NumberFormat('is-IS', { maximumFractionDigits: 0 })

export function LedgerTable({
  season,
  ledger,
  hypothetical,
}: {
  season: SeasonData
  ledger: Ledger
  hypothetical: boolean
}) {
  const teamName = (id: string) =>
    season.teams.find((t) => t.teamId === id)?.name ?? id
  const teamLogo = (id: string) =>
    season.teams.find((t) => t.teamId === id)?.logoUrl ?? null

  if (ledger.gameweeksCounted === 0) {
    return (
      <p className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-neutral-400">
        No gameweeks have finished yet. The ledger fills in from gameweek 1.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {hypothetical && (
        <div className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-200">
          <strong className="font-semibold">Hypothetical.</strong> The gameweek prize did
          not exist in {season.seasonYear}. These figures show what the rule{' '}
          <em>would</em> have paid. No money was or will be paid out for this season.
        </div>
      )}

      <table className="w-full border-collapse text-sm">
        <caption className="pb-3 text-left text-neutral-400">
          {ledger.gameweeksCounted} of {season.regularSeasonPeriods} gameweeks counted
          &middot; {isk.format(ledger.totalPaid)} ISK total
        </caption>
        <thead>
          <tr className="border-b border-neutral-700 text-left text-neutral-400">
            <th className="py-2 pr-2 font-medium">#</th>
            <th className="py-2 pr-2 font-medium">Team</th>
            <th className="py-2 pr-2 text-right font-medium">GW wins</th>
            <th className="py-2 text-right font-medium">ISK</th>
          </tr>
        </thead>
        <tbody>
          {ledger.entries.map((e, i) => (
            <tr key={e.teamId} className="border-b border-neutral-800/60">
              <td className="py-2 pr-2 text-neutral-500">{i + 1}</td>
              <td className="py-2 pr-2">
                <span className="flex items-center gap-2">
                  {teamLogo(e.teamId) && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={teamLogo(e.teamId)!}
                      alt=""
                      className="h-5 w-5 rounded-sm object-cover"
                    />
                  )}
                  {teamName(e.teamId)}
                </span>
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{e.gameweekWins}</td>
              <td className="py-2 text-right font-medium tabular-nums">
                {isk.format(e.isk)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
