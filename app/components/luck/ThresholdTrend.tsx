import type { SeasonView } from '../../lib/season-view'
import { averageThresholds } from '@/lib/stats/luck'
import { averageRecords, rankTable, winPoints } from '@/lib/stats/tables'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'

const NEEDS_SETTLED = 3

const WIDTH = 640
const HEIGHT = 160
const PAD = { top: 20, right: 12, bottom: 22, left: 12 }

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
        <path d={path} fill="none" className="stroke-cold" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={first.x} cy={first.y} r={3.5} className="fill-cold" />
        <circle cx={last.x} cy={last.y} r={3.5} className="fill-cold" />
        <text x={first.x} y={first.y - 8} textAnchor="start" className="fill-muted text-[10px]">
          GW{first.period} &middot; {formatScore(first.threshold)}
        </text>
        <text x={last.x} y={last.y - 8} textAnchor="end" className="fill-foreground text-[10px] font-semibold">
          GW{last.period} &middot; {formatScore(last.threshold)}
        </text>
      </svg>
      <p className="mt-1 text-xs text-muted">
        The league-mean score needed to beat average, gameweek by gameweek.
      </p>
      {clearsMost && (
        <p className="mt-3 border-t border-line pt-3 text-sm text-foreground">
          <span className="font-semibold text-gold">{teamName(season, clearsMost.teamId)}</span>{' '}
          clears the bar most &mdash; {clearsMost.wins}-{clearsMost.draws}-{clearsMost.losses}{' '}
          against the league average ({formatScore(winPoints(clearsMost))} pts).
        </p>
      )}
    </div>
  )
}
