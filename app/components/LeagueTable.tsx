import type { SeasonView } from '../lib/season-view'
import { combinedRecords, rankTable } from '@/lib/stats/tables'
import { streaks, type StreakInfo } from '@/lib/stats/records'
import { formatScore } from '../lib/format'
import { EmptyState } from './EmptyState'

const NEEDS_SETTLED = 1

/** "5-game winning streak" / "3-game losing run" / "2-game drawing run". */
function streakLabel(type: 'W' | 'D' | 'L', length: number): string {
  const noun = type === 'W' ? 'winning streak' : type === 'L' ? 'losing run' : 'drawing run'
  return `${length}-game ${noun}`
}

function FormBadge({ info }: { info: StreakInfo | undefined }) {
  if (!info || !info.current) {
    return (
      <span className="text-muted" aria-label="No form data yet">
        &mdash;
      </span>
    )
  }
  const { type, length } = info.current
  const arrow = type === 'W' ? '▲' : type === 'L' ? '▼' : '—'
  const color = type === 'W' ? 'text-win' : type === 'L' ? 'text-loss' : 'text-muted'
  const title = info.lastFive.length
    ? `Last ${info.lastFive.length}: ${info.lastFive.join(' ')}`
    : undefined
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-display font-bold ${color}`}
      aria-label={streakLabel(type, length)}
      title={title}
    >
      <span aria-hidden>{arrow}</span>
      <span className="tabular-nums" aria-hidden>
        {length}
      </span>
    </span>
  )
}

/**
 * The official Fantrax table: real + league-average fixtures combined,
 * ranked by win points then points-for. Crests, W-D-L, points-for, and a
 * form-arrow column driven by each team's current streak.
 */
export function LeagueTable({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return (
      <EmptyState
        needed={NEEDS_SETTLED}
        have={settled.length}
        what="The table needs a finished gameweek"
      />
    )
  }

  const ranked = rankTable(combinedRecords(season, now))
  const streakByTeam = new Map(streaks(season, now).map((s) => [s.teamId, s]))
  const teamById = new Map(season.teams.map((t) => [t.teamId, t]))

  return (
    <div className="rounded-lg border border-line bg-surface">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">
          {season.seasonYear} official table, real and league-average fixtures combined.
        </caption>
        <colgroup>
          <col className="w-7" />
          <col />
          <col className="w-16" />
          <col className="w-11" />
          <col className="w-12" />
        </colgroup>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pl-3 pr-1 font-medium">
              #
            </th>
            <th scope="col" className="py-2 pr-2 font-medium">
              Team
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">
              W-D-L
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">
              PF
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Form
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => {
            const team = teamById.get(r.teamId)
            const rankColor =
              i === 0 ? 'text-gold' : i === 1 ? 'text-foreground' : 'text-muted'
            return (
              <tr key={r.teamId} className="border-b border-line/60 last:border-b-0">
                <td className={`py-2 pl-3 pr-1 font-display font-bold tabular-nums ${rankColor}`}>
                  {i + 1}
                </td>
                <td className="min-w-0 py-2 pr-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {team?.logoUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={team.logoUrl}
                        alt=""
                        className="h-5 w-5 shrink-0 rounded-sm object-cover"
                      />
                    )}
                    <span className="hidden min-w-0 truncate sm:inline">
                      {team?.name ?? r.teamId}
                    </span>
                    <span className="min-w-0 truncate sm:hidden">
                      {team?.shortName ?? team?.name ?? r.teamId}
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums text-muted">
                  <span className="text-foreground">{r.wins}</span>-{r.draws}-
                  <span className="text-loss">{r.losses}</span>
                </td>
                <td className="py-2 pr-2 text-right font-medium tabular-nums">
                  {formatScore(r.pointsFor)}
                </td>
                <td className="py-2 pr-3 text-right">
                  <FormBadge info={streakByTeam.get(r.teamId)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-xs text-muted">
        Ranked by win points (1 per win, 0.5 per draw), then points-for. Combined: real
        opponent plus <em>League Average</em>.
      </p>
    </div>
  )
}
