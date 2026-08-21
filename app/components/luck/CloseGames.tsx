import type { SeasonView } from '../../lib/season-view'
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { closeGameRecords } from '@/lib/stats/luck'
import { rankTable } from '@/lib/stats/tables'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'

const NEEDS_SETTLED = 10

function Crest({ season, teamId }: { season: SeasonData; teamId: TeamId }) {
  const logo = season.teams.find((t) => t.teamId === teamId)?.logoUrl ?? null
  if (!logo) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={logo} alt="" className="h-5 w-5 shrink-0 rounded-sm object-cover" />
  )
}

/**
 * Record in nail-biters only, where the margin comes from the league's own
 * bottom-quartile distribution — never a fixed number, so it moves with
 * how tight the league actually is this season.
 */
export function CloseGames({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return (
      <EmptyState
        needed={NEEDS_SETTLED}
        have={settled.length}
        what="Close games need a longer season"
      />
    )
  }

  const { threshold, marginsSampled, records } = closeGameRecords(season, now)
  const ranked = rankTable(records).filter((r) => r.games > 0)
  const best = ranked[0]

  return (
    <div className="rounded-lg border border-line bg-surface">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-7" />
          <col />
          <col className="w-16" />
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
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              PF
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.teamId} className="border-b border-line/60 last:border-b-0">
              <td className="py-2 pl-3 pr-1 font-semibold tabular-nums text-muted">
                {i + 1}
              </td>
              <td className="min-w-0 py-2 pr-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Crest season={season} teamId={r.teamId} />
                  <span className="min-w-0 truncate">{teamName(season, r.teamId)}</span>
                </span>
              </td>
              <td className="py-2 pr-2 text-right tabular-nums text-muted">
                <span className="text-ink">{r.wins}</span>-{r.draws}-
                <span className="text-down">{r.losses}</span>
              </td>
              <td className="py-2 pr-3 text-right font-medium tabular-nums">
                {formatScore(r.pointsFor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-xs text-muted">
        Games decided by &le; {formatScore(threshold)} &mdash; the league&rsquo;s own bottom
        quartile ({marginsSampled} margins sampled).
      </p>
      {best && best.losses === 0 && best.draws === 0 && (
        <p className="border-t border-line px-3 py-2 text-sm text-ink">
          <span className="font-semibold text-money">{teamName(season, best.teamId)}</span> is a
          perfect {best.wins}-0-0 in the tightest games. Ice in their veins.
        </p>
      )}
    </div>
  )
}
