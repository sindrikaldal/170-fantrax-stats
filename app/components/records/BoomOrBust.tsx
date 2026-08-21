import type { SeasonView } from '../../lib/season-view'
import { scoreDistributions } from '@/lib/stats/records'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { TeamCrest } from '../TeamCrest'

const NEEDS_SETTLED = 8

const STRIP_W = 600
const STRIP_H = 26

/**
 * Every gameweek score a team has posted, as one dot per week on a scale
 * shared by the whole league — so the rows are directly comparable and a
 * wide scatter reads as wide at a glance. The tick is that team's mean.
 *
 * Hand-rolled SVG, no chart library: this is a dot per gameweek and a
 * vertical rule, and a dependency for that would be worse than the
 * fifteen lines it replaces.
 *
 * Gated at eight gameweeks because standard deviation over a handful of
 * scores describes the sample, not the team.
 */
export function BoomOrBust({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return (
      <EmptyState
        needed={NEEDS_SETTLED}
        have={settled.length}
        what="Boom-or-bust needs a real sample"
      />
    )
  }

  // Already sorted most-volatile first by the module.
  const dists = scoreDistributions(season, now).filter((d) => d.scores.length > 0)
  if (dists.length === 0) return null

  const allScores = dists.flatMap((d) => d.scores.map((s) => s.score))
  const min = Math.min(...allScores)
  const max = Math.max(...allScores)
  const range = max - min || 1
  const x = (score: number) => ((score - min) / range) * STRIP_W

  const metronomeId = dists[dists.length - 1].teamId

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5 text-xs text-muted">
        <span className="font-semibold uppercase tracking-[0.2em]">Most volatile first</span>
        <span className="tabular-nums">
          {formatScore(min)} &mdash; {formatScore(max)} across the league
        </span>
      </div>

      {dists.map((d) => {
        const metronome = d.teamId === metronomeId
        return (
          <div
            key={d.teamId}
            className="grid items-center gap-x-5 gap-y-2 border-b border-line p-4 last:border-b-0 md:grid-cols-[minmax(0,17rem)_1fr_minmax(0,10rem)]"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <TeamCrest season={season} teamId={d.teamId} />
              <span
                className="min-w-0 truncate font-medium text-ink"
                title={teamName(season, d.teamId)}
              >
                {teamName(season, d.teamId)}
              </span>
            </div>

            <svg
              viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}
              className="h-6 w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${teamName(season, d.teamId)}: ${d.scores.length} scores averaging ${formatScore(d.mean)}, standard deviation ${formatScore(d.stdDev)}.`}
            >
              <line
                x1={0}
                x2={STRIP_W}
                y1={STRIP_H / 2}
                y2={STRIP_H / 2}
                className="stroke-line"
                strokeWidth={2}
              />
              {d.scores.map((s) => (
                <circle
                  key={s.period}
                  cx={x(s.score)}
                  cy={STRIP_H / 2}
                  r={4}
                  className="fill-analysis"
                  opacity={0.45}
                />
              ))}
              <line
                x1={x(d.mean)}
                x2={x(d.mean)}
                y1={3}
                y2={STRIP_H - 3}
                className="stroke-ink"
                strokeWidth={2}
              />
            </svg>

            {/* The tag lives with the number it describes, not beside the
                name: parked in the name column it truncated the very team
                it was labelling. It sits above the figure rather than
                replacing the mean line, so no row loses information to it. */}
            <div className="md:text-right">
              {metronome && (
                <p className="text-xs font-semibold uppercase tracking-wider text-analysis">
                  The Metronome
                </p>
              )}
              <p className="font-display text-lg font-semibold tabular-nums text-ink">
                &plusmn;{formatScore(d.stdDev)}
              </p>
              <p className="text-xs text-muted tabular-nums">
                mean {formatScore(d.mean)} &middot; {d.scores.length} weeks
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
