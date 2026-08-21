import type { SeasonView } from '../../lib/season-view'
import { formTable } from '@/lib/stats/records'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { TeamCrest } from '../TeamCrest'

const WINDOW = 6
const NEEDS_SETTLED = 1

/**
 * A mini-league over the last six settled gameweeks — who is good *now*,
 * as opposed to who banked a good September.
 *
 * Below six gameweeks the window shrinks rather than the table hiding: a
 * three-week form table is honest as long as it says it covers three
 * weeks, which the caption does. That is why this gates at 1 and not 6.
 */
export function FormTable({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return (
      <EmptyState
        needed={NEEDS_SETTLED}
        have={settled.length}
        what="Form needs a finished gameweek"
      />
    )
  }

  const form = formTable(season, now, WINDOW)
  const covered = form.periods
  const partial = covered.length < WINDOW
  const played = form.rows.filter((r) => r.games > 0)

  return (
    <div className="rounded-lg border border-line bg-surface">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="border-b border-line px-3 py-2.5 text-left text-xs text-muted">
          <span className="font-semibold uppercase tracking-[0.2em]">
            {partial ? `Last ${covered.length}` : 'Last 6'}
          </span>{' '}
          &middot; gameweek{covered.length === 1 ? '' : 's'} {covered.join(', ')}
          {partial && ' — the full six-week window opens up as the season goes'}
        </caption>
        <colgroup>
          <col className="w-9" />
          <col />
          <col className="w-[4.25rem]" />
          <col className="w-20" />
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
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              PF
            </th>
          </tr>
        </thead>
        <tbody>
          {played.map((r, i) => (
            <tr key={r.teamId} className="border-b border-line/60 last:border-b-0">
              <td
                className={`py-2.5 pl-3 pr-1 font-semibold tabular-nums ${i === 0 ? 'text-money' : 'text-muted'}`}
              >
                {i + 1}
              </td>
              <td className="min-w-0 py-2.5 pr-2">
                <span className="flex min-w-0 items-center gap-2">
                  <TeamCrest season={season} teamId={r.teamId} />
                  <span className="min-w-0 truncate" title={teamName(season, r.teamId)}>
                    {teamName(season, r.teamId)}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap py-2.5 pr-2 text-right tabular-nums text-muted">
                <span className="text-ink">{r.wins}</span>-{r.draws}-
                <span className="text-down">{r.losses}</span>
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right font-medium tabular-nums">
                {formatScore(r.pointsFor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
