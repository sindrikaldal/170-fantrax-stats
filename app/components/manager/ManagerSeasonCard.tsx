import Link from 'next/link'
import type { ManagerSeasonStats } from '../../lib/manager-season'
import { formatScore, isk } from '../../lib/format'

function formatWins(n: number): string {
  return (Math.round(Math.abs(n) * 10) / 10).toFixed(1)
}

function Stat({
  label,
  value,
  accent = 'text-ink',
  detail,
}: {
  label: string
  value: string
  accent?: string
  detail?: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tabular-nums ${accent}`}>{value}</p>
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </div>
  )
}

/**
 * One season of one manager: prize money, near misses, schedule luck and
 * what was left on the bench. Money-adjacent figures keep the same colour
 * discipline as the season page — earned ISK in the money accent, ISK
 * merely missed or benched in the analysis accent — and a hypothetical
 * season says so on the card itself.
 */
export function ManagerSeasonCard({ stats }: { stats: ManagerSeasonStats }) {
  const { view, teamName, ledger, runnerUp, runnerUpWeeks, luck, allPlay, bench, benchWeeks } = stats
  const { season, settled, hypothetical } = view

  return (
    <article className="rounded-lg border border-line bg-surface">
      <header className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
          <Link href={`/season/${view.year}`} className="hover:text-money">
            {view.year}
          </Link>{' '}
          <span className="text-base font-normal text-muted">as {teamName}</span>
        </h3>
        <p className="text-xs text-muted">
          {settled.length} of {season.regularSeasonPeriods} gameweeks settled
          {hypothetical && (
            <span className="ml-2 font-semibold uppercase tracking-wide text-warn-ink">
              prize hypothetical
            </span>
          )}
        </p>
      </header>

      {settled.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Nothing settled yet.</p>
      ) : (
        <>
          <div className="grid gap-5 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Prize"
              value={`${isk.format(ledger?.isk ?? 0)} ISK`}
              accent={ledger ? 'text-money' : 'text-muted'}
              detail={`${ledger?.gameweekWins ?? 0} gameweek win${(ledger?.gameweekWins ?? 0) === 1 ? '' : 's'}`}
            />
            <Stat
              label="One place off"
              value={`${runnerUp?.finishes ?? 0}×`}
              accent={runnerUp ? 'text-analysis' : 'text-muted'}
              detail={
                runnerUp
                  ? `${isk.format(runnerUp.iskOnePlaceOff)} ISK missed, closest −${formatScore(runnerUp.narrowestMiss)}`
                  : 'never second'
              }
            />
            <Stat
              label="Schedule luck"
              value={
                luck
                  ? `${luck.delta > 0 ? '+' : luck.delta < 0 ? '−' : ''}${formatWins(luck.delta)}`
                  : '—'
              }
              accent={luck ? (luck.delta > 0.05 ? 'text-money' : luck.delta < -0.05 ? 'text-analysis' : 'text-muted') : 'text-muted'}
              detail={
                allPlay
                  ? `wins vs. an all-play schedule · all-play ${Math.round(allPlay.winPct * 100)}%`
                  : undefined
              }
            />
            <Stat
              label="Left on the bench"
              value={bench ? formatScore(bench.regretTotal) : '—'}
              accent={bench && bench.regretTotal > 0 ? 'text-analysis' : 'text-muted'}
              detail={
                bench
                  ? `${bench.wouldHaveWonMatchups} win${bench.wouldHaveWonMatchups === 1 ? '' : 's'} and ${bench.wouldHaveTakenPrizes} prize${bench.wouldHaveTakenPrizes === 1 ? '' : 's'} (${isk.format(bench.iskBenched)} ISK) a better eleven would have taken`
                  : 'lineups not captured yet'
              }
            />
          </div>

          {(runnerUpWeeks.length > 0 || benchWeeks.length > 0) && (
            <div className="grid gap-x-8 gap-y-4 border-t border-line px-5 py-4 text-sm lg:grid-cols-2">
              {runnerUpWeeks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    Second-place finishes
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {runnerUpWeeks.map((g) => (
                      <li
                        key={g.period}
                        className="rounded border border-line bg-paper px-2 py-1 tabular-nums"
                      >
                        <span className="text-muted">GW{g.period}</span>{' '}
                        <span className="text-analysis">−{formatScore(g.gap)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {benchWeeks.length > 0 && (
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    Worst benches
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {benchWeeks.slice(0, 5).map((r) => (
                      <li key={r.period} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="tabular-nums text-muted">GW{r.period}</span>
                        <span className="font-semibold tabular-nums text-analysis">
                          {formatScore(r.regret)}
                        </span>
                        <span className="min-w-0 truncate text-muted">
                          {r.shouldHaveStarted
                            .slice(0, 2)
                            .map((p) => `${p.name} ${formatScore(p.points)}`)
                            .join(', ')}
                        </span>
                        {r.wouldHaveTakenPrize ? (
                          <span className="text-xs font-medium text-analysis">prize</span>
                        ) : r.wouldHaveWonMatchup ? (
                          <span className="text-xs text-muted">win</span>
                        ) : null}
                      </li>
                    ))}
                    {benchWeeks.length > 5 && (
                      <li className="text-xs text-muted">
                        and {benchWeeks.length - 5} more gameweek{benchWeeks.length - 5 === 1 ? '' : 's'} with something left over
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </article>
  )
}
