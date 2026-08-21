import type { ManagerId } from '@/lib/domain/types'
import type { HeadToHead, NemesisBunny as RivalVerdicts, RivalVerdict } from '@/lib/stats/rivalries'
import type { ManagerCard } from '../../lib/manager-view'
import { CrestImage } from '../CrestImage'
import { formatScore } from '../../lib/format'


function VerdictRow({
  kind,
  verdict,
  card,
  sinceYear,
}: {
  kind: 'nemesis' | 'bunny'
  verdict: RivalVerdict
  card: ManagerCard | undefined
  sinceYear: number | null
}) {
  const nemesis = kind === 'nemesis'
  const accent = nemesis ? 'text-analysis' : 'text-money'
  const per = `${verdict.avgMargin > 0 ? '+' : '−'}${formatScore(Math.abs(verdict.avgMargin))}`

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${accent}`}>
          {nemesis ? 'Nemesis' : 'Bunny'}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-2 font-medium text-ink">
          <CrestImage url={card?.logoUrl ?? null} name={card?.name ?? ''} />
          <span className="min-w-0 truncate" title={card?.name}>
            {card?.name ?? verdict.opponentId}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {nemesis
            ? "Can't buy a win against them"
            : sinceYear
              ? `Free points since ${sinceYear}`
              : 'Free points'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-display text-xl font-semibold tabular-nums ${accent}`}>{per}</p>
        <p className="text-xs text-muted">
          per meeting &middot; {verdict.meetings}
        </p>
      </div>
    </div>
  )
}

/**
 * One card per manager with a settled rivalry: who owns them, who they
 * own. Managers without two meetings against anyone are listed below
 * rather than dropped — a name that appears there unexpectedly is how a
 * rename that slipped past MANAGER_OVERRIDES becomes visible.
 */
export function NemesisBunny({
  verdicts,
  matrix,
  managers,
}: {
  verdicts: RivalVerdicts[]
  matrix: HeadToHead[]
  managers: ManagerCard[]
}) {
  const cardById = new Map(managers.map((m) => [m.managerId, m]))

  // "Free points since N" must name the year the rivalry actually started,
  // not a hardcoded one — a pairing that first meets in 2026 did not exist
  // in 2025. Meetings are chronological, so the first one carries it.
  const firstMeetingYear = new Map<string, number>(
    matrix
      .filter((h) => h.meetings.length > 0)
      .map((h) => [`${h.managerId}|${h.opponentId}`, h.meetings[0].seasonYear]),
  )
  const since = (a: ManagerId, b: ManagerId) => firstMeetingYear.get(`${a}|${b}`) ?? null

  const withHistory = verdicts.filter((v) => v.nemesis || v.bunny)
  const rated = new Set(withHistory.map((v) => v.managerId))
  const waiting = managers.filter((m) => !rated.has(m.managerId))

  const ordered = [...withHistory].sort((a, b) =>
    (cardById.get(a.managerId)?.name ?? a.managerId).localeCompare(
      cardById.get(b.managerId)?.name ?? b.managerId,
      'is',
    ),
  )

  return (
    <div className="space-y-6">
      {ordered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((v) => {
            const self = cardById.get(v.managerId)
            return (
              <div
                key={v.managerId}
                className="rounded-lg border border-line bg-surface p-5"
              >
                <h4 className="flex min-w-0 items-center gap-2.5 border-b border-line pb-3 font-display text-lg font-semibold tracking-tight text-ink">
                  <CrestImage url={self?.logoUrl ?? null} name={self?.name ?? ''} size="h-6 w-6" />
                  <span className="min-w-0 truncate" title={self?.name}>
                    {self?.name ?? v.managerId}
                  </span>
                </h4>
                <div className="divide-y divide-line">
                  {v.nemesis && (
                    <VerdictRow
                      kind="nemesis"
                      verdict={v.nemesis}
                      card={cardById.get(v.nemesis.opponentId)}
                      sinceYear={since(v.managerId, v.nemesis.opponentId)}
                    />
                  )}
                  {v.bunny && (
                    <VerdictRow
                      kind="bunny"
                      verdict={v.bunny}
                      card={cardById.get(v.bunny.opponentId)}
                      sinceYear={since(v.managerId, v.bunny.opponentId)}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {waiting.length > 0 && (
        <div className="rounded-lg border border-dashed border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            New blood &mdash; no history yet
          </p>
          <p className="prose-measure mt-1 text-sm text-muted">
            Nobody has played them twice, so there is nothing honest to say. Every manager
            the league has ever had is listed either above or here.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {waiting.map((m) => (
              <li
                key={m.managerId}
                className="flex items-center gap-2 rounded-full border border-line bg-paper py-1 pl-1 pr-3 text-sm"
              >
                <CrestImage url={m?.logoUrl ?? null} name={m?.name ?? ''} />
                <span className="max-w-[12rem] truncate" title={m.name}>
                  {m.name}
                </span>
                <span className="text-xs text-muted tabular-nums">
                  {m.seasonYears.join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
