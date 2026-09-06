import type { SeasonData } from '@/lib/domain/types'
import type { BenchReport, TeamGameweekBench } from '@/lib/stats/bench'
import {formatScore} from '../../lib/format'
import { TeamCrest } from '../TeamCrest'
import { TeamName } from '../TeamName'

function culprits(row: TeamGameweekBench): string {
  return row.shouldHaveStarted
    .slice(0, 3)
    .map((p) => `${p.name} ${formatScore(p.points)}`)
    .join(', ')
}

function Badge({ tone, children }: { tone: 'prize' | 'win'; children: React.ReactNode }) {
  return (
    <span
      className={`whitespace-nowrap rounded bg-raised px-1.5 py-0.5 text-xs ring-1 ring-line ${tone === 'prize' ? 'font-medium text-analysis' : 'text-muted'}`}
    >
      {children}
    </span>
  )
}

/**
 * Gameweek by gameweek, newest first: the single worst bench decision of
 * the week with the players who should have started, then anyone else
 * whose better lineup would have flipped their matchup or taken the prize.
 * Always open — this list is the section, not an appendix to it.
 */
export function BenchHistory({ season, report }: { season: SeasonData; report: BenchReport }) {
  const weeks = [...report.periods].reverse().map((period) => {
    const rows = report.rows.filter((r) => r.period === period)
    const worst = rows.reduce<TeamGameweekBench | null>(
      (best, r) => (best === null || r.regret > best.regret ? r : best),
      null,
    )
    const others = rows
      .filter((r) => r !== worst && (r.wouldHaveTakenPrize || r.wouldHaveWonMatchup))
      .sort((a, b) => Number(b.wouldHaveTakenPrize) - Number(a.wouldHaveTakenPrize) || b.regret - a.regret)
    return { period, worst, others }
  })

  return (
    <div className="rounded-lg border border-line bg-surface">
      <h3 className="border-b border-line px-4 py-3 font-display text-lg font-semibold tracking-tight text-ink">
        Worst bench of the week{' '}
        <span className="text-sm font-normal text-muted">({report.periods.length})</span>
      </h3>
      <ol className="divide-y divide-line/60">
        {weeks.map(({ period, worst, others }) => (
          <li key={period} className="grid gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[3rem_1fr]">
            <div className="font-semibold tabular-nums text-muted">GW{period}</div>
            {worst === null || worst.regret === 0 ? (
              <p className="text-sm text-muted">Everyone fielded their best eleven.</p>
            ) : (
              <div className="min-w-0 space-y-1.5">
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
                    <TeamCrest season={season} teamId={worst.teamId} size="h-4 w-4" />
                    <span className="truncate"><TeamName season={season} teamId={worst.teamId} /></span>
                  </span>
                  <span className="text-muted">left</span>
                  <span className="font-display text-base font-semibold tabular-nums text-analysis">
                    {formatScore(worst.regret)}
                  </span>
                  <span className="text-muted">on the bench</span>
                  {worst.wouldHaveTakenPrize ? (
                    <Badge tone="prize">would have taken the prize</Badge>
                  ) : worst.wouldHaveWonMatchup ? (
                    <Badge tone="win">would have won</Badge>
                  ) : null}
                </p>
                {worst.shouldHaveStarted.length > 0 && (
                  <p className="text-sm text-muted">Should have started: {culprits(worst)}</p>
                )}
                {others.length > 0 && (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span>Also:</span>
                    {others.map((r) => (
                      <span key={r.teamId} className="flex items-center gap-1.5">
                        <TeamCrest season={season} teamId={r.teamId} size="h-3.5 w-3.5" />
                        <span><TeamName season={season} teamId={r.teamId} /></span>
                        <Badge tone={r.wouldHaveTakenPrize ? 'prize' : 'win'}>
                          {r.wouldHaveTakenPrize ? 'prize' : 'win'} with +{formatScore(r.regret)}
                        </Badge>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
