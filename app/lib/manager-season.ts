import type { TeamId } from '@/lib/domain/types'
import type { SeasonView } from './season-view'
import { loadBenchReport } from './bench-view'
import { computeLedger, type LedgerEntry } from '@/lib/stats/ledger'
import { computeRunnersUp, type GameweekRunnerUp, type RunnerUpEntry } from '@/lib/stats/runnerUp'
import { allPlayRecords, luckIndex, type AllPlayRecord, type LuckEntry } from '@/lib/stats/luck'
import type { TeamBenchSummary, TeamGameweekBench } from '@/lib/stats/bench'

/**
 * One manager's numbers for one season, pulled out of the season-wide
 * reports. Every field is optional because a season the manager sat out
 * of, or one with no settled gameweek yet, legitimately has none of them.
 */
export interface ManagerSeasonStats {
  view: SeasonView
  teamId: TeamId
  teamName: string
  ledger: LedgerEntry | null
  runnerUp: RunnerUpEntry | null
  /** Gameweeks this team finished second, ascending. */
  runnerUpWeeks: GameweekRunnerUp[]
  luck: LuckEntry | null
  allPlay: AllPlayRecord | null
  bench: TeamBenchSummary | null
  /** Gameweeks with something left on the bench, biggest regret first. */
  benchWeeks: TeamGameweekBench[]
  benchThrough: number | null
}

export function managerSeasonStats(view: SeasonView, teamId: TeamId, now: Date): ManagerSeasonStats {
  const { season } = view
  const ledger = computeLedger(season, now)
  const runnersUp = computeRunnersUp(season, now)
  const luck = luckIndex(season, now)
  const bench = loadBenchReport(view, now)

  return {
    view,
    teamId,
    teamName: season.teams.find((t) => t.teamId === teamId)?.name ?? teamId,
    ledger: ledger.entries.find((e) => e.teamId === teamId) ?? null,
    runnerUp: runnersUp.entries.find((e) => e.teamId === teamId) ?? null,
    runnerUpWeeks: runnersUp.gameweeks.filter((g) => g.runnersUp.includes(teamId)),
    luck: luck.find((e) => e.teamId === teamId) ?? null,
    allPlay: allPlayRecords(season, now).get(teamId) ?? null,
    bench: bench.entries.find((e) => e.teamId === teamId) ?? null,
    benchWeeks: bench.rows
      .filter((r) => r.teamId === teamId && r.regret > 0)
      .sort((a, b) => b.regret - a.regret),
    benchThrough: bench.throughPeriod,
  }
}
