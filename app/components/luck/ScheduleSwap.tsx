import type { SeasonView } from '../../lib/season-view'
import { pointsAgainstTable, scheduleSwap } from '@/lib/stats/luck'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { TeamCrest } from '../TeamCrest'
import { TeamName } from '../TeamName'

const NEEDS_SETTLED = 10

function verdict(count: number, tried: number): string {
  if (count === tried) return 'Playoffs on any schedule'
  if (count === 0) return 'Out on every schedule'
  return count * 2 >= tried ? 'Playoffs on most schedules' : 'Playoffs on few schedules'
}

/**
 * "In another universe…" — replay each team's weekly scores against every
 * other team's real fixture list and count how many of those alternate
 * schedules still send them to the playoffs. High counts are a receipt:
 * the record wasn't the schedule's doing.
 *
 * One panel, one row per team, laid out like the luck index above it so the
 * two read as a pair: the segmented bar is the number, the verdict says what
 * it means, and the explanation lives once in the header instead of on every
 * row.
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
  const tried = entries[0]?.schedulesTried ?? 0

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface">
      <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-analysis" />
      <div className="border-b border-line p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          In another universe&hellip;
        </p>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">
          Each team&rsquo;s weekly scores replayed against the fixture list of each of the other{' '}
          {tried} managers. Every segment is one of those schedules; filled means a top-
          {season.playoffTeams} finish.
        </p>
      </div>
      {entries.map((entry) => {
        const slate = hardestSlate.get(entry.teamId)
        return (
          <div
            key={entry.teamId}
            className="grid items-center gap-x-5 gap-y-2.5 border-b border-line p-4 last:border-b-0 md:grid-cols-[minmax(0,17rem)_1fr_minmax(0,19rem)]"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <TeamCrest season={season} teamId={entry.teamId} size="h-6 w-6" />
              <span
                className="min-w-0 truncate font-medium text-ink"
                title={teamName(season, entry.teamId)}
              >
                <TeamName season={season} teamId={entry.teamId} />
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div
                role="img"
                aria-label={`Makes playoffs under ${entry.playoffCount} of ${entry.schedulesTried} schedules`}
                className="flex h-2.5 flex-1 gap-1"
              >
                {Array.from({ length: entry.schedulesTried }, (_, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-full ${i < entry.playoffCount ? 'bg-analysis' : 'bg-raised'}`}
                  />
                ))}
              </div>
              <span
                aria-hidden
                className="w-9 text-right font-display text-base font-semibold tabular-nums tracking-tight text-ink"
              >
                {entry.playoffCount}/{entry.schedulesTried}
              </span>
            </div>

            <div className="md:text-right">
              <p
                className={`font-display text-base font-semibold tracking-tight ${entry.playoffCount === 0 ? 'text-muted' : 'text-analysis'}`}
              >
                {verdict(entry.playoffCount, entry.schedulesTried)}
              </p>
              {slate && (
                <p className="mt-0.5 text-xs text-muted">
                  {formatScore(slate.pointsAgainst)} against
                  {slate.lossesToTopScore > 0 &&
                    ` · ${slate.lossesToTopScore} loss${slate.lossesToTopScore === 1 ? '' : 'es'} to the week's best`}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
