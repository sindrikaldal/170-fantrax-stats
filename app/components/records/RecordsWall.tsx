import type { ReactNode } from 'react'
import type { SeasonView } from '../../lib/season-view'
import type { TeamId } from '@/lib/domain/types'
import { biggestCollapses, scoreExtremes, streaks } from '@/lib/stats/records'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { TeamCrest } from '../TeamCrest'

// Two settled gameweeks is the first point at which every card on the wall
// can exist: a collapse needs a week to fall from. High and low alone would
// render at one, but a wall with three of five slots empty reads as broken
// rather than early.
const NEEDS_SETTLED = 2

function RecordCard({
  eyebrow,
  value,
  accent = 'ink',
  holder,
  detail,
}: {
  eyebrow: string
  value: string
  accent?: 'ink' | 'money' | 'analysis' | 'down'
  holder: ReactNode
  detail: string
}) {
  const color = {
    ink: 'text-ink',
    money: 'text-money',
    analysis: 'text-analysis',
    down: 'text-down',
  }[accent]

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
        {eyebrow}
      </p>
      <p className={`mt-2 font-display text-4xl font-semibold tabular-nums ${color}`}>
        {value}
      </p>
      <div className="mt-3 flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
        {holder}
      </div>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  )
}

/**
 * The season's superlatives. Each card is one number worth shouting about,
 * with the crest of whoever owns it.
 *
 * Every figure here comes from `lib/stats/records`; the only thing this
 * component decides is which entry to show. The per-team arrays are already
 * sorted by the modules, so "who holds the record" is a first-element pick,
 * not a calculation.
 */
export function RecordsWall({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return (
      <EmptyState
        needed={NEEDS_SETTLED}
        have={settled.length}
        what="Records need a couple of gameweeks"
      />
    )
  }

  const { highest, lowest } = scoreExtremes(season, now)
  const allStreaks = streaks(season, now)
  const collapse = biggestCollapses(season, now)[0] ?? null

  const bestWin = allStreaks.reduce(
    (best, s) => (best === null || s.longestWin > best.longestWin ? s : best),
    null as (typeof allStreaks)[number] | null,
  )
  const worstRun = allStreaks.reduce(
    (worst, s) => (worst === null || s.longestLoss > worst.longestLoss ? s : worst),
    null as (typeof allStreaks)[number] | null,
  )

  const holder = (teamId: TeamId) => (
    <>
      <TeamCrest season={season} teamId={teamId} />
      <span className="min-w-0 truncate" title={teamName(season, teamId)}>
        {teamName(season, teamId)}
      </span>
    </>
  )

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {highest && (
        <RecordCard
          eyebrow="Season high"
          value={formatScore(highest.score)}
          accent="money"
          holder={holder(highest.teamId)}
          detail={`Gameweek ${highest.period}. Nobody has beaten it.`}
        />
      )}
      {lowest && (
        <RecordCard
          eyebrow="Season low"
          value={formatScore(lowest.score)}
          accent="down"
          holder={holder(lowest.teamId)}
          detail={`Gameweek ${lowest.period}. Somebody had to.`}
        />
      )}
      {bestWin && bestWin.longestWin > 0 && (
        <RecordCard
          eyebrow="Longest winning streak"
          value={`${bestWin.longestWin}`}
          accent="analysis"
          holder={holder(bestWin.teamId)}
          detail={`${bestWin.longestWin} on the bounce.`}
        />
      )}
      {worstRun && worstRun.longestLoss > 0 && (
        <RecordCard
          eyebrow="Longest losing run"
          value={`${worstRun.longestLoss}`}
          accent="down"
          holder={holder(worstRun.teamId)}
          detail={`${worstRun.longestLoss} straight. Grim.`}
        />
      )}
      {collapse && (
        <RecordCard
          eyebrow="Bottled It"
          value={`−${formatScore(collapse.drop)}`}
          accent="down"
          holder={holder(collapse.teamId)}
          detail={`${formatScore(collapse.fromScore)} in GW${collapse.fromPeriod}, then ${formatScore(collapse.toScore)} in GW${collapse.toPeriod}.`}
        />
      )}
    </div>
  )
}
