import { SEASON_YEARS } from '@/config/leagues'
import { loadSeason, prizeRuleApplies } from '@/lib/season/load'
import { computeLedger } from '@/lib/stats/ledger'
import { LedgerTable } from './components/LedgerTable'
import { GameweekHistory } from './components/GameweekHistory'

export default async function Page() {
  const now = new Date()
  const results = await Promise.allSettled(
    SEASON_YEARS.map(async (year) => {
      const season = await loadSeason(year)
      return { year, season, ledger: computeLedger(season, now) }
    }),
  )

  const asOf = now.toLocaleString('is-IS', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">170 Broskis</h1>
      <p className="mt-1 text-neutral-400">
        Gameweek prize ledger &mdash; 1,500 ISK to the highest-scoring team each gameweek,
        ties split.
      </p>
      <p className="mt-1 text-xs text-neutral-500">As of {asOf}</p>

      {results.map((result, i) => {
        const year = SEASON_YEARS[i]

        if (result.status === 'rejected') {
          // A failure loading one season (e.g. Fantrax's response shape
          // changed, or the request errored) must not take down the whole
          // page — the other season should still render fully.
          console.error(`Failed to load season ${year}:`, result.reason)
          return (
            <section key={year} className="mt-10">
              <h2 className="mb-4 text-lg font-medium">{year}</h2>
              <p className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
                {year} data is temporarily unavailable.
              </p>
            </section>
          )
        }

        const { season, ledger } = result.value
        const hypothetical = !prizeRuleApplies(year)

        return (
          <section key={year} className="mt-10">
            <h2 className="mb-4 text-lg font-medium">{year}</h2>
            <LedgerTable season={season} ledger={ledger} hypothetical={hypothetical} />
            <GameweekHistory season={season} ledger={ledger} hypothetical={hypothetical} />
          </section>
        )
      })}
    </main>
  )
}
