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
  // Bundled so TypeScript narrows both together — a bare boolean flag
  // doesn't carry the non-null through to the JSX below.
  const loaded = view && ledger && !loadError ? { view, ledger } : null

  return (
    <main>
      <header className="border-b border-line bg-surface">
        <div className="container-page py-10 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-analysis">
            Fantrax Premier League &middot; Draft League
          </p>
          <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
            170 <span className="text-money">Broskis</span>
          </h1>
          <p className="prose-measure mt-4 text-base text-muted">
            Gameweek prize ledger &mdash; 1.500 ISK to the highest-scoring team each
            gameweek, ties split.
          </p>
          <p className="mt-3 text-xs text-muted">As of {asOf}</p>
        </div>
      </header>

      <div className="container-page space-y-14 py-10 sm:py-14">
        {/*
          Desktop is its own layout, not the phone stack widened. The ledger
          and the table are the two "what happened" views of the same season
          and are meant to be read together, so they share a row from lg up
          and stack on phone. DOM order matches visual order at every width —
          no CSS reordering — so the money view stays first for everyone.
        */}
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
          <section>
            <SectionHeader
              title={`${CURRENT_SEASON} Ledger`}
              subtitle="Every finished gameweek, updated live."
            />
            {!loaded ? (
              <p className="rounded-lg border border-down/40 bg-surface p-4 text-sm text-down">
                {CURRENT_SEASON} data is temporarily unavailable.
              </p>
            ) : (
              <>
                <LedgerTable
                  season={loaded.view.season}
                  ledger={loaded.ledger}
                  hypothetical={loaded.view.hypothetical}
                />
                <GameweekHistory
                  season={loaded.view.season}
                  ledger={loaded.ledger}
                  hypothetical={loaded.view.hypothetical}
                />
              </>
            )}
          </section>

          {loaded && (
            <section>
              <SectionHeader
                title="The Table"
                subtitle="Official standings — real opponent plus League Average."
              />
              <LeagueTable view={loaded.view} now={now} />
            </section>
          )}
        </div>

        {loaded && (
          <>
            <section>
              <SectionHeader
                title="This Week's Awards"
                subtitle="Honours nobody asked for."
              />
              <AwardsStrip view={loaded.view} now={now} />
            </section>

            <div>
              {/*
                The hit area is the link; the underline is an inner span.
                Padding the link itself to reach the 44px touch minimum
                would drag the border two-and-a-half lines below the text
                and read as a section rule rather than an underline.
              */}
              <Link
                href={`/season/${CURRENT_SEASON}`}
                className="inline-flex min-h-11 items-center font-display text-lg font-semibold tracking-tight text-ink transition-colors hover:text-money"
              >
                <span className="border-b-2 border-money pb-0.5">The deep cuts &rarr;</span>
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
