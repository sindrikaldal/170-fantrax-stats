import Link from 'next/link'
import { CURRENT_SEASON } from '@/config/leagues'
import { computeLedger } from '@/lib/stats/ledger'
import { loadSeasonView } from './lib/season-view'
import { LedgerTable } from './components/LedgerTable'
import { GameweekHistory } from './components/GameweekHistory'
import { AwardsStrip } from './components/AwardsStrip'
import { LeagueTable } from './components/LeagueTable'
import { SectionHeader } from './components/SectionHeader'

export default async function Page() {
  const now = new Date()
  const asOf = now.toLocaleString('is-IS', { dateStyle: 'medium', timeStyle: 'short' })

  let view: Awaited<ReturnType<typeof loadSeasonView>> | null = null
  let loadError: unknown = null
  try {
    view = await loadSeasonView(CURRENT_SEASON, now)
  } catch (err) {
    // A failed fetch for the current season must not take down the whole
    // page shell — nav and masthead still render, with an honest error panel
    // in place of the ledger.
    loadError = err
    console.error(`Failed to load season ${CURRENT_SEASON}:`, err)
  }

  const ledger = view ? computeLedger(view.season, now) : null

  return (
    <main>
      <header className="border-b border-line bg-gradient-to-b from-surface to-background px-4 py-10 text-center sm:py-14">
        <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-cold">
          Fantrax Premier League &middot; Draft League
        </p>
        <h1 className="mt-3 font-display text-5xl font-extrabold uppercase tracking-tight text-foreground sm:text-7xl">
          170 <span className="text-gold">Broskis</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted sm:text-base">
          Gameweek prize ledger &mdash; 1.500 ISK to the highest-scoring team each
          gameweek, ties split.
        </p>
        <p className="mt-4 text-xs text-muted">As of {asOf}</p>
      </header>

      <div className="mx-auto max-w-4xl space-y-12 px-4 py-8 sm:py-12">
        <section>
          <SectionHeader
            title={`${CURRENT_SEASON} Ledger`}
            subtitle="Every finished gameweek, updated live."
          />

          {loadError || !view || !ledger ? (
            <p className="rounded-lg border border-loss/40 bg-surface p-4 text-sm text-loss">
              {CURRENT_SEASON} data is temporarily unavailable.
            </p>
          ) : (
            <>
              <LedgerTable season={view.season} ledger={ledger} hypothetical={view.hypothetical} />
              <GameweekHistory
                season={view.season}
                ledger={ledger}
                hypothetical={view.hypothetical}
              />
            </>
          )}
        </section>

        {view && !loadError && (
          <>
            <section>
              <SectionHeader
                title="This Week's Awards"
                subtitle="Honours nobody asked for."
              />
              <AwardsStrip view={view} now={now} />
            </section>

            <section>
              <SectionHeader
                title="The Table"
                subtitle="Official standings — real opponent plus League Average."
              />
              <LeagueTable view={view} now={now} />
            </section>

            <div className="text-center">
              <Link
                href={`/season/${CURRENT_SEASON}`}
                className="inline-block font-display text-sm font-bold uppercase tracking-wide text-cold hover:text-foreground"
              >
                The deep cuts &rarr;
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
