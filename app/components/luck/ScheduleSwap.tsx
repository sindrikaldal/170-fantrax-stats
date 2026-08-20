import type { SeasonView } from '../../lib/season-view'
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { pointsAgainstTable, scheduleSwap } from '@/lib/stats/luck'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'

const NEEDS_SETTLED = 10

function Crest({ season, teamId }: { season: SeasonData; teamId: TeamId }) {
  const logo = season.teams.find((t) => t.teamId === teamId)?.logoUrl ?? null
  if (!logo) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={logo} alt="" className="h-6 w-6 shrink-0 rounded-sm object-cover" />
  )
}

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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {entries.map((entry) => {
        const slate = hardestSlate.get(entry.teamId)
        return (
          <div key={entry.teamId} className="relative overflow-hidden rounded-lg border border-line bg-surface p-4">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cold/70 to-cold/0"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              In another universe&hellip;
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Crest season={season} teamId={entry.teamId} />
              <span className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
                {teamName(season, entry.teamId)}
              </span>
            </div>
            <p className="mt-2 font-display text-xl font-extrabold uppercase tracking-wide text-cold sm:text-2xl">
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
