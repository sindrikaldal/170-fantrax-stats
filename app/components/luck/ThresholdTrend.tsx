import type { SeasonView } from '../../lib/season-view'
import { averageThresholds } from '@/lib/stats/luck'
import { averageRecords, rankTable, winPoints } from '@/lib/stats/tables'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'

const NEEDS_SETTLED = 3

const WIDTH = 640
const HEIGHT = 140
const PAD = { top: 10, right: 6, bottom: 10, left: 6 }

/**
 * The moving bar to clear, week by week — the league mean, plotted as a
 * hand-rolled inline SVG line (no chart library, per constraint). Below
 * it, whoever has cleared that bar most often: the closest thing to a
 * pure skill scoreboard this app has.
 */
export function ThresholdTrend({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return (
      <EmptyState
        needed={NEEDS_SETTLED}
        have={settled.length}
        what="The threshold trend needs a longer season"
      />
    )
  }

  const points = averageThresholds(season, now)
  const values = points.map((p) => p.threshold)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const innerW = WIDTH - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom

  const coords = points.map((p, i) => ({
    x: PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
    y: PAD.top + innerH - ((p.threshold - min) / range) * innerH,
    ...p,
  }))
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const first = coords[0]
  const last = coords[coords.length - 1]

  const clearsMost = rankTable(averageRecords(season, now))[0]

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`League-average threshold from gameweek ${first.period} (${formatScore(first.threshold)}) to gameweek ${last.period} (${formatScore(last.threshold)})`}
      >
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={HEIGHT - PAD.bottom}
          y2={HEIGHT - PAD.bottom}
          className="stroke-line"
          strokeWidth={1}
        />
        <path d={path} fill="none" className="stroke-analysis" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={first.x} cy={first.y} r={3.5} className="fill-analysis" />
        <circle cx={last.x} cy={last.y} r={3.5} className="fill-analysis" />
      </svg>
      {/*
        The endpoint labels are HTML, not SVG <text>. Inside a 640-unit
        viewBox scaled to the container, a 10px label renders at about
        5px on a 343px phone — the viewBox scales type along with
        everything else. Out here they are 12px at every width, and the
        svg's aria-label still carries both figures for screen readers.
      */}
      <div className="mt-1 flex items-baseline justify-between gap-4 text-xs tabular-nums">
        <span className="text-muted">
          GW{first.period} &middot; {formatScore(first.threshold)}
        </span>
        <span className="font-semibold text-ink">
          GW{last.period} &middot; {formatScore(last.threshold)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        The league-mean score needed to beat average, gameweek by gameweek.
      </p>
      {clearsMost && (
        <p className="prose-measure mt-3 border-t border-line pt-3 text-sm text-ink">
          <span className="font-semibold text-money">{teamName(season, clearsMost.teamId)}</span>{' '}
          clears the bar most &mdash; {clearsMost.wins}-{clearsMost.draws}-{clearsMost.losses}{' '}
          against the league average ({formatScore(winPoints(clearsMost))} pts).
        </p>
      )}
    </div>
  )
}
