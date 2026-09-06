import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods, scoresForPeriod } from '@/lib/domain/season'
import { PRIZE_PER_GAMEWEEK } from './ledger'

export interface GameweekRunnerUp {
  period: number
  topScore: number
  /** The second-highest distinct score that week. */
  runnerUpScore: number
  /** How far short of the prize the runner-up finished. */
  gap: number
  /** Every team on the runner-up score. Usually one. */
  runnersUp: TeamId[]
}

export interface RunnerUpEntry {
  teamId: TeamId
  /** Gameweeks finished on the second-highest score. */
  finishes: number
  /**
   * The prize a runner-up was one place off, counted in full for every
   * finish. Nobody was ever owed this — it is a "what you missed" figure
   * and must never be shown as money owed or alongside the ledger totals.
   */
  iskOnePlaceOff: number
  /** Sum of the gaps to the winner across every runner-up finish. */
  totalPointsShort: number
  /** The smallest gap to the winner across those finishes. */
  narrowestMiss: number
}

export interface RunnerUpReport {
  prizePerGameweek: number
  /** Final gameweeks only, like the ledger. */
  gameweeks: GameweekRunnerUp[]
  entries: RunnerUpEntry[]
}

/**
 * Who finished one place off the gameweek prize.
 *
 * Deliberately simpler than the ledger's tie rules: the runner-up is
 * whoever posted the second-highest *distinct* score, every team on it
 * counts, and each is credited the full prize. A tie at the top just makes
 * the next score down second. Ties among runners-up do not split anything,
 * because nothing was ever paid.
 *
 * Uses the same audit as the ledger and, like it, skips gameweeks still in
 * progress, so the two never disagree about which gameweeks exist.
 */
export function computeRunnersUp(
  season: SeasonData,
  now: Date,
  prizePerGameweek: number = PRIZE_PER_GAMEWEEK,
): RunnerUpReport {
  const { settled, provisional } = auditRegularPeriods(season, now)

  const gameweeks: GameweekRunnerUp[] = []
  for (const period of settled) {
    if (provisional.includes(period)) continue
    const scores = scoresForPeriod(season, period)
    const distinct = [...new Set(scores.values())].sort((a, b) => b - a)
    // A week where every team tied has no second place.
    if (distinct.length < 2) continue
    const [topScore, runnerUpScore] = distinct
    const runnersUp = [...scores.entries()]
      .filter(([, v]) => v === runnerUpScore)
      .map(([id]) => id)
    gameweeks.push({ period, topScore, runnerUpScore, gap: topScore - runnerUpScore, runnersUp })
  }

  const byTeam = new Map<TeamId, RunnerUpEntry>()
  for (const gw of gameweeks) {
    for (const teamId of gw.runnersUp) {
      const entry = byTeam.get(teamId) ?? {
        teamId,
        finishes: 0,
        iskOnePlaceOff: 0,
        totalPointsShort: 0,
        narrowestMiss: Infinity,
      }
      entry.finishes += 1
      entry.iskOnePlaceOff += prizePerGameweek
      entry.totalPointsShort += gw.gap
      entry.narrowestMiss = Math.min(entry.narrowestMiss, gw.gap)
      byTeam.set(teamId, entry)
    }
  }

  const entries = [...byTeam.values()].sort(
    (a, b) =>
      b.finishes - a.finishes ||
      a.narrowestMiss - b.narrowestMiss ||
      a.totalPointsShort - b.totalPointsShort,
  )

  return { prizePerGameweek, gameweeks, entries }
}
