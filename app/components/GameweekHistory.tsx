import type { Ledger } from '@/lib/stats/ledger'
import type { SeasonData } from '@/lib/domain/types'

const isk = new Intl.NumberFormat('is-IS', { maximumFractionDigits: 0 })

export function GameweekHistory({
  season,
  ledger,
}: {
  season: SeasonData
  ledger: Ledger
}) {
  if (ledger.gameweeks.length === 0) return null

  const teamName = (id: string) =>
    season.teams.find((t) => t.teamId === id)?.name ?? id

  // Most recent gameweek first: the interesting one is the latest.
  const rows = [...ledger.gameweeks].reverse()

  return (
    <details className="mt-6 rounded-lg border border-neutral-800">
      <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-300">
        Gameweek by gameweek ({ledger.gameweeks.length})
      </summary>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-neutral-800 text-left text-neutral-400">
            <th className="py-2 pl-4 pr-2 font-medium">GW</th>
            <th className="py-2 pr-2 font-medium">Winner</th>
            <th className="py-2 pr-2 text-right font-medium">Score</th>
            <th className="py-2 pr-4 text-right font-medium">ISK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.period} className="border-b border-neutral-800/60">
              <td className="py-2 pl-4 pr-2 text-neutral-500 tabular-nums">{g.period}</td>
              <td className="py-2 pr-2">
                {g.winners.map((id) => teamName(id)).join(' & ')}
                {g.winners.length > 1 && (
                  <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                    tie, split
                  </span>
                )}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{g.topScore}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {isk.format(g.iskPerWinner)}
                {g.winners.length > 1 && ' ea'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
