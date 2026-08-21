import type { SeasonView } from '../../lib/season-view'
import { POWER_WEIGHTS, powerRankings } from '@/lib/stats/power'
import { teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { TeamCrest } from '../TeamCrest'

const NEEDS_SETTLED = 3

function Movement({ movement }: { movement: number | null }) {
  if (movement === null) {
    return (
      <span className="text-muted" aria-label="No previous ranking yet">
        <span aria-hidden>&middot;</span>
      </span>
    )
  }
  if (movement === 0) {
    return (
      <span className="text-muted" aria-label="No change">
        <span aria-hidden>&mdash;</span>
      </span>
    )
  }
  const up = movement > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold ${up ? 'text-up' : 'text-down'}`}
      aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(movement)} place${Math.abs(movement) === 1 ? '' : 's'}`}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      <span className="tabular-nums" aria-hidden>
        {Math.abs(movement)}
      </span>
    </span>
  )
}

/**
 * The blend: 40% real record, 40% all-play, 20% recent form. Real record
 * alone rewards an easy schedule and all-play alone ignores that the
 * league is played against opponents, so neither is the whole answer.
 *
 * Movement compares against the same blend recomputed without the most
 * recent gameweek, so it needs two settled weeks to exist at all — hence
 * the gate at three, where the first arrow is already meaningful rather
 * than every team showing a dot.
 */
export function PowerRankings({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return (
      <EmptyState
        needed={NEEDS_SETTLED}
        have={settled.length}
        what="Power rankings need a few gameweeks"
      />
    )
  }

  const rankings = powerRankings(season, now)
  if (rankings.length === 0) return null
  const top = rankings[0].score || 1

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <p className="border-b border-line px-4 py-2.5 text-xs text-muted">
        <span className="font-semibold uppercase tracking-[0.2em]">Power index</span>{' '}
        &middot; {Math.round(POWER_WEIGHTS.real * 100)}% real record,{' '}
        {Math.round(POWER_WEIGHTS.allPlay * 100)}% all-play,{' '}
        {Math.round(POWER_WEIGHTS.form * 100)}% last six. Movement is against last
        gameweek.
      </p>
      <ol>
        {rankings.map((r) => (
          <li key={r.teamId} className="border-b border-line p-4 last:border-b-0">
            {/*
              The bar spans the full row underneath the name rather than
              taking a column beside it. In a four-column layout the bar is
              whatever the name column leaves over — about 70px inside a
              half-width panel, too short to compare anything. Given a whole
              row it stays legible at any container width, and the names
              stop fighting it for space.
            */}
            <div className="flex items-baseline gap-3">
              <span
                className={`w-6 shrink-0 font-semibold tabular-nums ${r.rank === 1 ? 'text-money' : 'text-muted'}`}
              >
                {r.rank}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2.5 self-center">
                <TeamCrest season={season} teamId={r.teamId} />
                <span
                  className="min-w-0 truncate font-medium text-ink"
                  title={teamName(season, r.teamId)}
                >
                  {teamName(season, r.teamId)}
                </span>
              </span>
              <span className="font-display text-base font-semibold tabular-nums text-ink">
                {(r.score * 100).toFixed(1)}
              </span>
              <span className="w-7 shrink-0 text-right">
                <Movement movement={r.movement} />
              </span>
            </div>

            {/* Scaled against the leader, not against 1.0: nobody wins 100%
                of an all-play league, so an absolute scale would squash
                every team into the left third of the track. */}
            <span className="mt-2 ml-9 block h-2 overflow-hidden rounded-full bg-raised">
              <span
                className="block h-full rounded-full bg-money"
                style={{ width: `${Math.max((r.score / top) * 100, 2)}%` }}
              />
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
