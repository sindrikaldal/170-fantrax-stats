import type { SeasonData, TeamId } from '@/lib/domain/types'
import { completedRegularPeriods, scoresForPeriod } from '@/lib/domain/season'

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
  const periods = completedRegularPeriods(season, now)
  const gameweeks: GameweekPrize[] = []

  let periodsWithheld = 0

  for (const period of periods) {
    const scores = scoresForPeriod(season, period)

    // `isPeriodComplete` only compares dates; it has no idea whether scores
    // actually exist. Fantrax reports an unplayed gameweek's score as the
    // string "0" rather than leaving it blank, so `parseScore` happily turns
    // it into 0 rather than null — the missing-score omission in
    // `scoresForPeriod` never fires. Without this guard a date whose gameweek
    // hasn't been played yet would crown every team a "winner" on a 0-0-0...
    // tie and split real ISK across the whole league. Require a score from
    // every team in the period before trusting it at all.
    //
    // The expected count is derived from THIS period's own real fixtures
    // (two teams per fixture), not from `season.teams.length`. Those two
    // numbers come from separate fetches with different cache TTLs
    // (`fetchLeagueInfo` at 24h vs `fetchSchedule` at 30min): a manager
    // joining mid-season would make `teams.length` grow before the stale
    // 24h-cached team count catches up, and every period would fail this
    // guard — including ones with real, complete scores — until the caches
    // resync. Deriving the expectation from the period's own fixture rows
    // keeps the guard period-local and immune to that skew. A period with
    // zero fixtures at all is treated the same as an incomplete one: it
    // must not pay.
    const periodFixtures = season.fixtures.filter((f) => f.period === period).length
    const expectedScores = 2 * periodFixtures
    if (periodFixtures === 0 || scores.size !== expectedScores) {
      periodsWithheld += 1
      continue
    }

    const topScore = Math.max(...scores.values())

    // A real gameweek in this scoring system cannot plausibly leave every
    // team at exactly 0 — that pattern only occurs when Fantrax has posted
    // placeholder "0" scores for a gameweek that hasn't been played yet.
    // Refuse to pay out on it even though every team reported a score.
    if (topScore <= 0) {
      periodsWithheld += 1
      continue
    }

    const winners = [...scores.entries()]
      .filter(([, v]) => v === topScore)
      .map(([id]) => id)

    gameweeks.push({
      period,
      topScore,
      winners,
      iskPerWinner: prizePerGameweek / winners.length,
    })
  }

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
    periodsWithheld,
  }
}
