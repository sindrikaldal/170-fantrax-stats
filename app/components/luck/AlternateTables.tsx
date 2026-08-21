import type { SeasonView } from '../../lib/season-view'
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { averageRecords, rankTable, realRecords, type TeamRecord } from '@/lib/stats/tables'
import { formatScore, teamName } from '../../lib/format'
import { EmptyState } from '../EmptyState'

const NEEDS_SETTLED = 6

function Crest({ season, teamId }: { season: SeasonData; teamId: TeamId }) {
  const logo = season.teams.find((t) => t.teamId === teamId)?.logoUrl ?? null
  if (!logo) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={logo} alt="" className="h-5 w-5 shrink-0 rounded-sm object-cover" />
  )
}

function MovementBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-muted">&mdash;</span>
  const up = delta > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold ${up ? 'text-up' : 'text-down'}`}
      title={up ? `${delta} spot${delta === 1 ? '' : 's'} better vs. average` : `${-delta} spot${delta === -1 ? '' : 's'} worse vs. average`}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      <span className="tabular-nums" aria-hidden>
        {Math.abs(delta)}
      </span>
    </span>
  )
}

function MiniTable({
  season,
  title,
  ranked,
  badges,
}: {
  season: SeasonData
  title: string
  ranked: TeamRecord[]
  badges?: Map<TeamId, number>
}) {
  return (
    <div className="rounded-lg border border-line bg-surface">
      <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        {title}
      </p>
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-6" />
          <col />
          <col className="w-[3.75rem]" />
          <col className="w-11" />
          {badges && <col className="w-9" />}
        </colgroup>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.teamId} className="border-b border-line/60 last:border-b-0">
              <td className="py-1.5 pl-3 pr-1 font-semibold tabular-nums text-muted">
                {i + 1}
              </td>
              <td className="min-w-0 py-1.5 pr-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Crest season={season} teamId={r.teamId} />
                  <span className="min-w-0 truncate">
                    {season.teams.find((t) => t.teamId === r.teamId)?.shortName ??
                      teamName(season, r.teamId)}
                  </span>
                </span>
              </td>
              <td className="py-1.5 pr-1 text-right tabular-nums text-muted">
                <span className="text-ink">{r.wins}</span>-{r.draws}-
                <span className="text-down">{r.losses}</span>
              </td>
              <td className="py-1.5 pr-3 text-right font-medium tabular-nums">
                {formatScore(r.pointsFor)}
              </td>
              {badges && (
                <td className="py-1.5 pr-3 text-right">
                  <MovementBadge delta={badges.get(r.teamId) ?? 0} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Real-only vs. average-only tables side by side. Same games, different
 * question: real carries the whole schedule, average strips it out.
 * Where a team lands differently between the two says more about the
 * fixture list than the roster.
 */
export function AlternateTables({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return (
      <EmptyState
        needed={NEEDS_SETTLED}
        have={settled.length}
        what="Alternate tables need a longer season"
      />
    )
  }

  const realRanked = rankTable(realRecords(season, now))
  const avgRanked = rankTable(averageRecords(season, now))
  const realRank = new Map(realRanked.map((r, i) => [r.teamId, i + 1]))
  const avgRank = new Map(avgRanked.map((r, i) => [r.teamId, i + 1]))

  const deltas = new Map<TeamId, number>(
    season.teams.map((t) => [
      t.teamId,
      (realRank.get(t.teamId) ?? 0) - (avgRank.get(t.teamId) ?? 0),
    ]),
  )

  const deltaEntries = [...deltas.entries()]
  const biggestRiser = deltaEntries.reduce<[TeamId, number] | null>(
    (best, entry) => (best === null || entry[1] > best[1] ? entry : best),
    null,
  )
  const biggestFaller = deltaEntries.reduce<[TeamId, number] | null>(
    (worst, entry) => (worst === null || entry[1] < worst[1] ? entry : worst),
    null,
  )
  const riser = biggestRiser && biggestRiser[1] > 0 ? biggestRiser[0] : null
  const faller = biggestFaller && biggestFaller[1] < 0 ? biggestFaller[0] : null

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MiniTable season={season} title="Real Record" ranked={realRanked} />
        <MiniTable
          season={season}
          title="Vs. League Average"
          ranked={avgRanked}
          badges={deltas}
        />
      </div>
      <p className="prose-measure mt-3 text-sm text-muted">
        {riser && (
          <>
            <span className="font-semibold text-up">{teamName(season, riser)}</span> jumps{' '}
            {deltas.get(riser)} spot{deltas.get(riser) === 1 ? '' : 's'} once the schedule stops
            mattering
            {faller && '. '}
          </>
        )}
        {faller && (
          <>
            <span className="font-semibold text-down">{teamName(season, faller)}</span> falls{' '}
            {Math.abs(deltas.get(faller) ?? 0)} — the schedule was doing the heavy lifting.
          </>
        )}
        {!riser && !faller && 'Same teams, same order. The schedule had nothing to do with it.'}
      </p>
    </div>
  )
}
