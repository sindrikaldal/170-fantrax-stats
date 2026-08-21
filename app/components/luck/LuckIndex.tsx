import type { SeasonView } from '../../lib/season-view'
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { allPlayRecords, luckIndex } from '@/lib/stats/luck'
import { teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'

const NEEDS_SETTLED = 6

/**
 * Luck deltas are win points — 1 per win, 0.5 per draw — not fantasy score
 * points. A delta of 7.5 means seven and a half *wins*, so the copy always
 * says "wins" and never the bare word "points", which readers correctly
 * hear as score points and would be off by an order of magnitude. One
 * decimal is the right resolution: half-wins are real, hundredths are noise.
 */
function formatWins(n: number): string {
  return (Math.round(Math.abs(n) * 10) / 10).toFixed(1)
}

function Crest({ season, teamId }: { season: SeasonData; teamId: TeamId }) {
  const logo = season.teams.find((t) => t.teamId === teamId)?.logoUrl ?? null
  if (!logo) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={logo} alt="" className="h-6 w-6 shrink-0 rounded-sm object-cover" />
  )
}

/**
 * One diverging bar per team on a shared scale: banked more win points than
 * an all-play schedule would have paid (the money accent, to the right) or
 * fewer (the analysis accent, to the left). Sorted luckiest-first by
 * `luckIndex`, which already carries that order.
 *
 * The row is three columns on desktop — team, bar, verdict — so the bars
 * share one long axis and stay directly comparable down the column. On
 * phone the same row stacks.
 */
export function LuckIndex({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return (
      <EmptyState
        needed={NEEDS_SETTLED}
        have={settled.length}
        what="The luck index needs a longer season"
      />
    )
  }

  const entries = luckIndex(season, now)
  const allPlay = allPlayRecords(season, now)
  const maxAbs = Math.max(...entries.map((e) => Math.abs(e.delta)), 0.01)

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      {entries.map((entry) => {
        const pct = Math.min((Math.abs(entry.delta) / maxAbs) * 100, 100)
        const lucky = entry.delta > 0
        // A delta that rounds to zero must not read "0.0 wins the schedule
        // stole" — at this resolution the schedule did nothing either way.
        const neutral = formatWins(entry.delta) === '0.0'
        const ap = allPlay.get(entry.teamId)
        return (
          <div
            key={entry.teamId}
            className="grid items-center gap-x-5 gap-y-2.5 border-b border-line p-4 last:border-b-0 md:grid-cols-[minmax(0,17rem)_1fr_minmax(0,15rem)]"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Crest season={season} teamId={entry.teamId} />
              {/* Team names are arbitrary user input, so truncation is the
                  designed fallback rather than a bug — the title keeps the
                  full name reachable for sighted users, and the text node
                  itself is intact for screen readers. */}
              <span
                className="min-w-0 truncate font-medium text-ink"
                title={teamName(season, entry.teamId)}
              >
                {teamName(season, entry.teamId)}
              </span>
            </div>

            {/* Shared axis: the midpoint is zero, so bar lengths compare
                directly across every row in the column. */}
            <div className="relative grid h-2.5 grid-cols-2 overflow-hidden rounded-full bg-raised">
              <div className="flex justify-end">
                {!lucky && (
                  <div
                    className="h-full rounded-l-full bg-analysis"
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
              <div className="flex justify-start">
                {lucky && (
                  <div
                    className="h-full rounded-r-full bg-money"
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
              <div
                aria-hidden
                className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line"
              />
            </div>

            <div className="md:text-right">
              <p
                className={`font-display text-base font-semibold tracking-tight ${neutral ? 'text-muted' : lucky ? 'text-money' : 'text-analysis'}`}
              >
                {neutral
                  ? 'Exactly the record you earned'
                  : lucky
                    ? `+${formatWins(entry.delta)} wins the schedule gifted`
                    : `${formatWins(entry.delta)} wins the schedule stole`}
              </p>
              {ap && (
                <p className="mt-0.5 text-xs text-muted">
                  All-play {formatWins(ap.points)} pts from {ap.games} games (
                  {Math.round(ap.winPct * 100)}%)
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
