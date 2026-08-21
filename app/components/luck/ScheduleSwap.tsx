import type { SeasonView } from '../../lib/season-view'
import { pointsAgainstTable, scheduleSwap } from '@/lib/stats/luck'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { TeamCrest } from '../TeamCrest'

const NEEDS_SETTLED = 10


/**
 * "In another universe…" — replay each team's weekly scores against every
 * other team's real fixture list and count how many of those alternate
 * schedules still send them to the playoffs. High counts are a receipt:
 * the record wasn't the schedule's doing.
 */
export function ScheduleSwap({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return (
      <EmptyState
        needed={NEEDS_SETTLED}
        have={settled.length}
        what="Schedule swap needs a longer season"
      />
    )
  }

  const entries = scheduleSwap(season, now)
  const hardestSlate = new Map(pointsAgainstTable(season, now).map((e) => [e.teamId, e]))

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => {
        const slate = hardestSlate.get(entry.teamId)
        return (
          <div key={entry.teamId} className="relative overflow-hidden rounded-lg border border-line bg-surface p-4">
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-analysis" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              In another universe&hellip;
            </p>
            <div className="mt-1 flex items-center gap-2">
              <TeamCrest season={season} teamId={entry.teamId} size="h-6 w-6" />
              <span className="font-display text-lg font-semibold tracking-tight text-ink">
                {teamName(season, entry.teamId)}
              </span>
            </div>
            <p className="mt-3 font-display text-xl font-semibold tracking-tight text-analysis sm:text-2xl">
              Makes playoffs under {entry.playoffCount} of {entry.schedulesTried} schedules
            </p>
            {slate && (
              <p className="mt-2 text-sm text-muted">
                Hardest slate: {formatScore(slate.pointsAgainst)} against
                {slate.lossesToTopScore > 0 &&
                  ` · ${slate.lossesToTopScore} loss${slate.lossesToTopScore === 1 ? '' : 'es'} to the week's top score`}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
