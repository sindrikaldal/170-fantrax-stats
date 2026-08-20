import { SEASON_YEARS } from '@/config/leagues'
import { loadSeason, prizeRuleApplies } from '@/lib/season/load'
import { computeLedger } from '@/lib/stats/ledger'
import { LedgerTable } from './components/LedgerTable'
import { GameweekHistory } from './components/GameweekHistory'

export default async function Page() {
  const now = new Date()
  const seasons = await Promise.all(
    SEASON_YEARS.map(async (year) => {
      const season = await loadSeason(year)
      return { year, season, ledger: computeLedger(season, now) }
    }),
  )

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">170 Broskis</h1>
      <p className="mt-1 text-neutral-400">
        Gameweek prize ledger &mdash; 1,500 ISK to the highest-scoring team each gameweek,
        ties split.
      </p>

      {seasons.map(({ year, season, ledger }) => (
        <section key={year} className="mt-10">
          <h2 className="mb-4 text-lg font-medium">{year}</h2>
          <LedgerTable
            season={season}
            ledger={ledger}
            hypothetical={!prizeRuleApplies(year)}
          />
          <GameweekHistory season={season} ledger={ledger} />
        </section>
      ))}
    </main>
  )
}
