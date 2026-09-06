import type {
  LineupPlayer,
  LineupRules,
  LineupSnapshot,
  Position,
  SeasonData,
  TeamId,
} from '@/lib/domain/types'
import { auditRegularPeriods, scoresForPeriod } from '@/lib/domain/season'
import { PRIZE_PER_GAMEWEEK } from './ledger'

/** 11 starters, at most 1 G, 5 D, 5 M, 3 F. Identical in both known seasons. */
export const LINEUP_RULES: LineupRules = {
  maxActive: 11,
  maxPerPosition: { G: 1, D: 5, M: 5, F: 3 },
}

export interface BestLineup {
  players: LineupPlayer[]
  points: number
}

function greedy(
  assigned: { player: LineupPlayer; position: Position }[],
  rules: LineupRules,
): BestLineup {
  const remaining: Record<Position, number> = { ...rules.maxPerPosition }
  const players: LineupPlayer[] = []
  let points = 0
  for (const { player, position } of [...assigned].sort((a, b) => b.player.points - a.player.points)) {
    if (players.length >= rules.maxActive) break
    if (remaining[position] <= 0) continue
    remaining[position] -= 1
    players.push(player)
    points += player.points
  }
  return { players, points }
}

/**
 * The highest-scoring legal lineup from a roster, with hindsight.
 *
 * Only players who scored more than zero are considered: an active slot may
 * be left empty, so a starter on negative points is regret too. Position
 * caps plus the overall cap form a laminar family, for which picking the
 * highest scorers first is exactly optimal once each player's position is
 * fixed; the rare player eligible at more than one position is handled by
 * trying every assignment.
 */
export function bestLineup(roster: LineupPlayer[], rules: LineupRules = LINEUP_RULES): BestLineup {
  const candidates = roster.filter((p) => p.points > 0)
  const fixed = candidates.filter((p) => p.positions.length === 1)
  const flexible = candidates.filter((p) => p.positions.length > 1)

  let best: BestLineup = { players: [], points: 0 }
  const assign = (i: number, chosen: { player: LineupPlayer; position: Position }[]) => {
    if (i === flexible.length) {
      const result = greedy(
        [...fixed.map((p) => ({ player: p, position: p.positions[0] })), ...chosen],
        rules,
      )
      if (result.points > best.points) best = result
      return
    }
    for (const position of flexible[i].positions) {
      assign(i + 1, [...chosen, { player: flexible[i], position }])
    }
  }
  assign(0, [])
  return best
}

export interface TeamGameweekBench {
  period: number
  teamId: TeamId
  /** The score Fantrax recorded, from the schedule. */
  actual: number
  /** What the best legal lineup would have scored. */
  optimal: number
  /** optimal minus actual. */
  regret: number
  /** Raw points scored by the reserves, whether or not they had a legal slot. */
  benchPoints: number
  /** Bench players the best lineup would have started, highest first. */
  shouldHaveStarted: LineupPlayer[]
  opponentId: TeamId | null
  opponentScore: number | null
  /** The matchup was not won, and the best lineup would have won it. */
  wouldHaveWonMatchup: boolean
  /**
   * The team did not take the gameweek prize, and the best lineup would have
   * beaten every other team's actual score outright.
   */
  wouldHaveTakenPrize: boolean
}

export interface TeamBenchSummary {
  teamId: TeamId
  gameweeks: number
  regretTotal: number
  benchPointsTotal: number
  /** Gameweeks where a better lineup would have turned a draw or loss into a win. */
  wouldHaveWonMatchups: number
  wouldHaveTakenPrizes: number
  /**
   * Prize a better lineup would have taken. Hypothetical by construction:
   * counterfactuals across teams overlap, and nobody was owed this.
   */
  iskBenched: number
  worstWeek: TeamGameweekBench | null
}

export interface BenchReport {
  prizePerGameweek: number
  /** Settled periods with a consistent lineup snapshot, ascending. */
  periods: number[]
  throughPeriod: number | null
  /** Settled periods the snapshot script has not captured yet. */
  missingPeriods: number[]
  /** Captured periods whose starters did not sum to the recorded scores. Dropped. */
  inconsistentPeriods: number[]
  /**
   * Settled gameweeks still in progress (open window). Excluded from
   * `periods`: a bench verdict on a half-played week would change by Monday.
   */
  inProgressPeriods: number[]
  rows: TeamGameweekBench[]
  entries: TeamBenchSummary[]
}

/**
 * What every team left on the bench, gameweek by gameweek.
 *
 * Judged on the same final periods as the ledger, further limited to those
 * with a committed lineup snapshot. Actual scores come from the schedule, not
 * from the snapshot, so the flags below are always measured against the
 * numbers the ledger used; a snapshot whose starters disagree with the
 * schedule is dropped rather than trusted.
 */
export function computeBench(
  season: SeasonData,
  snapshots: LineupSnapshot[],
  now: Date,
  prizePerGameweek: number = PRIZE_PER_GAMEWEEK,
  rules: LineupRules = LINEUP_RULES,
): BenchReport {
  const { settled, provisional } = auditRegularPeriods(season, now)
  const byPeriod = new Map(
    snapshots.filter((s) => s.seasonYear === season.seasonYear).map((s) => [s.period, s]),
  )

  const periods: number[] = []
  const missingPeriods: number[] = []
  const inconsistentPeriods: number[] = []
  const rows: TeamGameweekBench[] = []

  for (const period of settled) {
    if (provisional.includes(period)) continue
    const snapshot = byPeriod.get(period)
    if (!snapshot) {
      missingPeriods.push(period)
      continue
    }
    const scores = scoresForPeriod(season, period)
    const lineups = new Map(snapshot.teams.map((t) => [t.teamId, t.players]))
    const consistent = [...scores].every(([teamId, score]) => {
      const players = lineups.get(teamId)
      if (!players) return false
      const sum = players.filter((p) => p.starter).reduce((s, p) => s + p.points, 0)
      return Math.abs(sum - score) <= 1e-6
    })
    if (!consistent) {
      inconsistentPeriods.push(period)
      continue
    }
    periods.push(period)

    const topScore = Math.max(...scores.values())
    for (const [teamId, actual] of scores) {
      const players = lineups.get(teamId)!
      const best = bestLineup(players, rules)
      const starters = new Set(players.filter((p) => p.starter).map((p) => p.playerId))
      const shouldHaveStarted = best.players
        .filter((p) => !starters.has(p.playerId))
        .sort((a, b) => b.points - a.points)
      const benchPoints = players.filter((p) => !p.starter).reduce((s, p) => s + p.points, 0)

      const fixture = season.fixtures.find(
        (f) => f.period === period && (f.homeTeamId === teamId || f.awayTeamId === teamId),
      )
      const opponentId = fixture
        ? fixture.homeTeamId === teamId
          ? fixture.awayTeamId
          : fixture.homeTeamId
        : null
      const opponentScore = opponentId === null ? null : (scores.get(opponentId) ?? null)

      const othersTop = Math.max(
        ...[...scores].filter(([id]) => id !== teamId).map(([, v]) => v),
      )
      rows.push({
        period,
        teamId,
        actual,
        optimal: best.points,
        regret: Math.max(best.points - actual, 0),
        benchPoints,
        shouldHaveStarted,
        opponentId,
        opponentScore,
        wouldHaveWonMatchup:
          opponentScore !== null && actual <= opponentScore && best.points > opponentScore,
        wouldHaveTakenPrize: actual < topScore && best.points > othersTop,
      })
    }
  }

  const byTeam = new Map<TeamId, TeamBenchSummary>()
  for (const row of rows) {
    const e = byTeam.get(row.teamId) ?? {
      teamId: row.teamId,
      gameweeks: 0,
      regretTotal: 0,
      benchPointsTotal: 0,
      wouldHaveWonMatchups: 0,
      wouldHaveTakenPrizes: 0,
      iskBenched: 0,
      worstWeek: null,
    }
    e.gameweeks += 1
    e.regretTotal += row.regret
    e.benchPointsTotal += row.benchPoints
    if (row.wouldHaveWonMatchup) e.wouldHaveWonMatchups += 1
    if (row.wouldHaveTakenPrize) {
      e.wouldHaveTakenPrizes += 1
      e.iskBenched += prizePerGameweek
    }
    if (row.regret > 0 && (!e.worstWeek || row.regret > e.worstWeek.regret)) e.worstWeek = row
    byTeam.set(row.teamId, e)
  }

  const entries = [...byTeam.values()].sort(
    (a, b) => b.regretTotal - a.regretTotal || b.benchPointsTotal - a.benchPointsTotal,
  )

  return {
    prizePerGameweek,
    periods,
    throughPeriod: periods.length ? periods[periods.length - 1] : null,
    missingPeriods,
    inconsistentPeriods,
    inProgressPeriods: provisional,
    rows,
    entries,
  }
}
