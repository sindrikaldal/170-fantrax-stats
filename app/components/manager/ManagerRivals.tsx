import Link from 'next/link'
import type { ManagerId } from '@/lib/domain/types'
import type { HeadToHead, NemesisBunny, RivalVerdict } from '@/lib/stats/rivalries'
import { managerHref, type ManagerCard } from '../../lib/manager-view'
import { CrestImage } from '../CrestImage'
import { formatScore } from '../../lib/format'

function signed(n: number): string {
  const s = formatScore(Math.abs(n))
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : '0'
}

function Verdict({
  kind,
  verdict,
  card,
  sinceYear,
}: {
  kind: 'nemesis' | 'bunny'
  verdict: RivalVerdict | null
  card: ManagerCard | undefined
  sinceYear: number | null
}) {
  const nemesis = kind === 'nemesis'
  const accent = nemesis ? 'text-analysis' : 'text-money'
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface p-5">
      <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${accent}`}>
        {nemesis ? 'Nemesis' : 'Bunny'}
      </p>
      {verdict ? (
        <>
          <Link
            href={managerHref(verdict.opponentId)}
            className="mt-2 flex min-w-0 items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-ink hover:text-money"
          >
            <CrestImage url={card?.logoUrl ?? null} name={card?.name ?? ''} size="h-6 w-6" />
            <span className="min-w-0 truncate" title={card?.name}>
              {card?.name ?? verdict.opponentId}
            </span>
          </Link>
          <p className={`mt-2 font-display text-3xl font-semibold tabular-nums ${accent}`}>
            {signed(verdict.avgMargin)}
          </p>
          <p className="text-sm text-muted">
            per meeting over {verdict.meetings}
            {nemesis
              ? " — can't buy a win against them"
              : sinceYear
                ? ` — free points since ${sinceYear}`
                : ' — free points'}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Nobody has been played twice yet, so there is nothing honest to say.
        </p>
      )}
    </div>
  )
}

/**
 * One manager's rivalries: who owns them, who they own, and the record
 * against every opponent they have ever met, across all seasons.
 */
export function ManagerRivals({
  managerId,
  matrix,
  verdict,
  managers,
}: {
  managerId: ManagerId
  matrix: HeadToHead[]
  verdict: NemesisBunny | undefined
  managers: ManagerCard[]
}) {
  const cardById = new Map(managers.map((m) => [m.managerId, m]))
  const rows = matrix
    .filter((h) => h.managerId === managerId && h.meetings.length > 0)
    .sort((a, b) => b.aggregateMargin - a.aggregateMargin)
  const since = (opponentId: ManagerId) =>
    rows.find((h) => h.opponentId === opponentId)?.meetings[0]?.seasonYear ?? null

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Rivalries</p>
        <p className="mt-2 text-sm text-muted">No meeting has been played yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Verdict
          kind="nemesis"
          verdict={verdict?.nemesis ?? null}
          card={verdict?.nemesis ? cardById.get(verdict.nemesis.opponentId) : undefined}
          sinceYear={verdict?.nemesis ? since(verdict.nemesis.opponentId) : null}
        />
        <Verdict
          kind="bunny"
          verdict={verdict?.bunny ?? null}
          card={verdict?.bunny ? cardById.get(verdict.bunny.opponentId) : undefined}
          sinceYear={verdict?.bunny ? since(verdict.bunny.opponentId) : null}
        />
      </div>

      <div className="rounded-lg border border-line bg-surface">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            Head-to-head record against every opponent, all seasons combined.
          </caption>
          <colgroup>
            <col />
            <col className="w-16 sm:w-20" />
            <col className="w-14 sm:w-16" />
            <col className="hidden sm:table-column sm:w-40" />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="py-2 pl-4 pr-2 font-medium">
                Opponent
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">
                W-D-L
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-medium" title="Aggregate margin">
                Agg
              </th>
              <th scope="col" className="hidden py-2 pr-4 text-right font-medium sm:table-cell">
                Last meeting
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const card = cardById.get(h.opponentId)
              const last = h.meetings[h.meetings.length - 1]
              return (
                <tr key={h.opponentId} className="border-b border-line/60 last:border-b-0">
                  <td className="min-w-0 py-2.5 pl-4 pr-2">
                    <Link
                      href={managerHref(h.opponentId)}
                      className="flex min-w-0 items-center gap-2.5 hover:text-money"
                    >
                      <CrestImage url={card?.logoUrl ?? null} name={card?.name ?? ''} />
                      <span className="min-w-0 truncate" title={card?.name}>
                        {card?.name ?? h.opponentId}
                      </span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-2 text-right tabular-nums">
                    <span className="text-up">{h.wins}</span>-{h.draws}-
                    <span className="text-down">{h.losses}</span>
                  </td>
                  <td
                    className={`whitespace-nowrap py-2.5 pr-2 text-right font-semibold tabular-nums ${h.aggregateMargin > 0 ? 'text-money' : h.aggregateMargin < 0 ? 'text-analysis' : 'text-muted'}`}
                  >
                    {signed(h.aggregateMargin)}
                  </td>
                  <td className="hidden py-2.5 pr-4 text-right text-xs tabular-nums leading-tight text-muted sm:table-cell">
                    GW{last.period} &rsquo;{String(last.seasonYear).slice(2)}
                    <span className="block text-sm text-ink">
                      {formatScore(last.forScore)}&ndash;{formatScore(last.againstScore)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
