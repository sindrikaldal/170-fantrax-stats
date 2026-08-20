import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods, scoresForPeriod } from '@/lib/domain/season'

/** ISK awarded to the highest-scoring team each gameweek. New for the 2026 season. */
export const PRIZE_PER_GAMEWEEK = 1500

export interface GameweekPrize {
  period: number
  topScore: number
  /** More than one entry means a tie; the prize is split evenly. */
  winners: TeamId[]
  iskPerWinner: number
}

export interface LedgerEntry {
  teamId: TeamId
  /** A shared win counts as one win, even though it pays a fraction. */
  gameweekWins: number
  isk: number
}

export interface Ledger {
  prizePerGameweek: number
  gameweeks: GameweekPrize[]
  entries: LedgerEntry[]
  totalPaid: number
  gameweeksCounted: number
  /**
   * Regular-season periods whose end date has passed but whose scores were
   * withheld by the completeness guards above (as opposed to gameweeks that
   * simply haven't been played yet). Distinguishes "awaiting final scores"
   * from "not yet happened" for the UI.
   */
  periodsWithheld: number
}

/**
 * The gameweek prize ledger.
 *
 * Only completed regular-season gameweeks count. The *League Average*
 * pseudo-team is structurally absent from `scoresForPeriod`, so it can
 * never win. Ties split the prize evenly.
 */
export function computeLedger(
  season: SeasonData,
  now: Date,
  prizePerGameweek: number = PRIZE_PER_GAMEWEEK,
): Ledger {
  // All completeness guards — full score set, no truncated fixture rows,
  // no all-zero placeholder periods — live in auditRegularPeriods, shared
  // with every stat module. Only settled periods pay.
  const { settled, withheld } = auditRegularPeriods(season, now)

  const gameweeks: GameweekPrize[] = settled.map((period) => {
    const scores = scoresForPeriod(season, period)
    const topScore = Math.max(...scores.values())
    const winners = [...scores.entries()]
      .filter(([, v]) => v === topScore)
      .map(([id]) => id)
    return { period, topScore, winners, iskPerWinner: prizePerGameweek / winners.length }
  })

  const byTeam = new Map<TeamId, LedgerEntry>()
  for (const gw of gameweeks) {
    for (const teamId of gw.winners) {
      const entry = byTeam.get(teamId) ?? { teamId, gameweekWins: 0, isk: 0 }
      entry.gameweekWins += 1
      entry.isk += gw.iskPerWinner
      byTeam.set(teamId, entry)
    }
  }

  const entries = [...byTeam.values()].sort(
    (a, b) => b.isk - a.isk || b.gameweekWins - a.gameweekWins,
  )

  return {
    prizePerGameweek,
    gameweeks,
    entries,
    totalPaid: gameweeks.reduce((s, g) => s + g.iskPerWinner * g.winners.length, 0),
    gameweeksCounted: gameweeks.length,
    periodsWithheld: withheld.length,
  }
}
