import type { SeasonView } from '../../lib/season-view'
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { allPlayRecords, luckIndex } from '@/lib/stats/luck'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'

const NEEDS_SETTLED = 6

function Crest({ season, teamId }: { season: SeasonData; teamId: TeamId }) {
  const logo = season.teams.find((t) => t.teamId === teamId)?.logoUrl ?? null
  if (!logo) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={logo} alt="" className="h-6 w-6 shrink-0 rounded-sm object-cover" />
  )
}

/**
 * Horizontal diverging bar per team: lucky (banked more win points than an
 * all-play schedule would have paid) in gold to the right, unlucky in cold
 * to the left. Sorted luckiest-first by `luckIndex`, which already carries
 * that order.
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
    <div className="space-y-3">
      {entries.map((entry) => {
        const pct = Math.min((Math.abs(entry.delta) / maxAbs) * 100, 100)
        const lucky = entry.delta > 0
        const ap = allPlay.get(entry.teamId)
        return (
          <div key={entry.teamId} className="rounded-lg border border-line bg-surface p-3">
            <div className="flex min-w-0 items-center gap-2">
              <Crest season={season} teamId={entry.teamId} />
              <span className="min-w-0 truncate font-display font-bold uppercase tracking-wide text-foreground">
                {teamName(season, entry.teamId)}
              </span>
            </div>
            <p
              className={`mt-1 font-display text-lg font-extrabold tabular-nums ${lucky ? 'text-gold' : 'text-cold'} sm:text-xl`}
            >
              {lucky
                ? `+${formatScore(entry.delta)} on what you deserve`
                : `${formatScore(Math.abs(entry.delta))} points the universe owes you`}
            </p>
            <div className="mt-2 grid h-2.5 grid-cols-2 overflow-hidden rounded-full bg-line/60">
              <div className="flex justify-end">
                {!lucky && (
                  <div className="h-full rounded-l-full bg-cold" style={{ width: `${pct}%` }} />
                )}
              </div>
              <div className="flex justify-start">
                {lucky && (
                  <div className="h-full rounded-r-full bg-gold" style={{ width: `${pct}%` }} />
                )}
              </div>
            </div>
            {ap && (
              <p className="mt-1.5 text-xs text-muted">
                All-play: {formatScore(ap.points)} pts from {ap.games} games (
                {Math.round(ap.winPct * 100)}%)
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
