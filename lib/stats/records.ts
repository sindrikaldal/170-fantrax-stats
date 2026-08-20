import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods, scoresForPeriod } from '@/lib/domain/season'
import { rankTable, type TeamRecord } from './tables'

export interface ScoreExtreme {
  teamId: TeamId
  period: number
  score: number
}

/** Season high and low single-gameweek scores. Earlier period wins a tie. */
export function scoreExtremes(
  season: SeasonData,
  now: Date,
): { highest: ScoreExtreme | null; lowest: ScoreExtreme | null } {
  const { settled } = auditRegularPeriods(season, now)
  let highest: ScoreExtreme | null = null
  let lowest: ScoreExtreme | null = null
  for (const period of settled) {
    for (const [teamId, score] of scoresForPeriod(season, period)) {
      if (highest === null || score > highest.score) highest = { teamId, period, score }
      if (lowest === null || score < lowest.score) lowest = { teamId, period, score }
    }
  }
  return { highest, lowest }
}

export type MatchResult = 'W' | 'D' | 'L'

export interface StreakInfo {
  teamId: TeamId
  longestWin: number
  longestLoss: number
  /** The run the team is on right now; null before any game. */
  current: { type: MatchResult; length: number } | null
  /** Most recent result last. */
  lastFive: MatchResult[]
}

/** Per-team result sequence over real fixtures in settled gameweeks. */
function resultSequence(season: SeasonData, now: Date): Map<TeamId, MatchResult[]> {
  const { settled } = auditRegularPeriods(season, now)
  const seq = new Map<TeamId, MatchResult[]>(season.teams.map((t) => [t.teamId, []]))
  for (const period of settled) {
    for (const f of season.fixtures) {
      if (f.period !== period || f.homeScore === null || f.awayScore === null) continue
      const homeResult: MatchResult =
        f.homeScore > f.awayScore ? 'W' : f.homeScore < f.awayScore ? 'L' : 'D'
      const awayResult: MatchResult =
        homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'D'
      seq.get(f.homeTeamId)?.push(homeResult)
      seq.get(f.awayTeamId)?.push(awayResult)
    }
  }
  return seq
}

export function streaks(season: SeasonData, now: Date): StreakInfo[] {
  return [...resultSequence(season, now).entries()].map(([teamId, results]) => {
    let longestWin = 0
    let longestLoss = 0
    let winRun = 0
    let lossRun = 0
    for (const r of results) {
      winRun = r === 'W' ? winRun + 1 : 0
      lossRun = r === 'L' ? lossRun + 1 : 0
      longestWin = Math.max(longestWin, winRun)
      longestLoss = Math.max(longestLoss, lossRun)
    }
    let current: StreakInfo['current'] = null
    if (results.length > 0) {
      const type = results[results.length - 1]
      let length = 0
      for (let i = results.length - 1; i >= 0 && results[i] === type; i--) length += 1
      current = { type, length }
    }
    return { teamId, longestWin, longestLoss, current, lastFive: results.slice(-5) }
  })
}

export interface FormTable {
  window: number
  /** The settled gameweeks actually covered — fewer than window early on. */
  periods: number[]
  rows: TeamRecord[]
}

/** Rolling mini-league over the last `window` settled gameweeks. */
export function formTable(season: SeasonData, now: Date, window = 6): FormTable {
  const { settled } = auditRegularPeriods(season, now)
  const periods = settled.slice(-window)
  const inWindow = new Set(periods)
  const records = new Map<TeamId, TeamRecord>(
    season.teams.map((t) => [
      t.teamId,
      { teamId: t.teamId, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 },
    ]),
  )
  for (const f of season.fixtures) {
    if (!inWindow.has(f.period) || f.homeScore === null || f.awayScore === null) continue
    for (const [id, mine, theirs] of [
      [f.homeTeamId, f.homeScore, f.awayScore],
      [f.awayTeamId, f.awayScore, f.homeScore],
    ] as const) {
      const r = records.get(id)
      if (!r) continue
      r.games += 1
      r.pointsFor += mine
      r.pointsAgainst += theirs
      if (mine > theirs) r.wins += 1
      else if (mine < theirs) r.losses += 1
      else r.draws += 1
    }
  }
  return { window, periods, rows: rankTable(records) }
}

export interface ScoreDistribution {
  teamId: TeamId
  scores: { period: number; score: number }[]
  mean: number
  /** Population standard deviation. High = boom-or-bust, low = metronome. */
  stdDev: number
}

export function scoreDistributions(season: SeasonData, now: Date): ScoreDistribution[] {
  const { settled } = auditRegularPeriods(season, now)
  const byTeam = new Map<TeamId, { period: number; score: number }[]>(
    season.teams.map((t) => [t.teamId, []]),
  )
  for (const period of settled) {
    for (const [teamId, score] of scoresForPeriod(season, period)) {
      byTeam.get(teamId)?.push({ period, score })
    }
  }
  return [...byTeam.entries()]
    .map(([teamId, scores]) => {
      const n = scores.length
      const mean = n ? scores.reduce((s, x) => s + x.score, 0) / n : 0
      const stdDev = n
        ? Math.sqrt(scores.reduce((s, x) => s + (x.score - mean) ** 2, 0) / n)
        : 0
      return { teamId, scores, mean, stdDev }
    })
    .sort((a, b) => b.stdDev - a.stdDev || a.teamId.localeCompare(b.teamId))
}

export interface Collapse {
  teamId: TeamId
  fromPeriod: number
  toPeriod: number
  fromScore: number
  toScore: number
  drop: number
}

/** Each team's worst week-on-week fall, biggest first. */
export function biggestCollapses(season: SeasonData, now: Date): Collapse[] {
  const { settled } = auditRegularPeriods(season, now)
  const scoresByPeriod = new Map(settled.map((p) => [p, scoresForPeriod(season, p)]))
  const out: Collapse[] = []
  for (const team of season.teams) {
    let worst: Collapse | null = null
    for (const p of settled) {
      if (!scoresByPeriod.has(p + 1)) continue
      const from = scoresByPeriod.get(p)?.get(team.teamId)
      const to = scoresByPeriod.get(p + 1)?.get(team.teamId)
      if (from === undefined || to === undefined) continue
      const drop = from - to
      if (drop > 0 && (worst === null || drop > worst.drop)) {
        worst = { teamId: team.teamId, fromPeriod: p, toPeriod: p + 1, fromScore: from, toScore: to, drop }
      }
    }
    if (worst) out.push(worst)
  }
  return out.sort((a, b) => b.drop - a.drop || a.teamId.localeCompare(b.teamId))
}

export interface WeeklyAwards {
  period: number
  /** Ties share the honour, exactly like the prize ledger. */
  topScore: { teamIds: TeamId[]; score: number }
  biggestBlowout: {
    period: number
    winnerId: TeamId
    loserId: TeamId
    winnerScore: number
    loserScore: number
    margin: number
  } | null
  /** Highest score that still lost. */
  unluckiestLoss: { teamId: TeamId; score: number } | null
  /** Lowest score that still won. */
  luckiestWin: { teamId: TeamId; score: number } | null
}

/** Auto-generated gameweek honours. Work from gameweek one, no history needed. */
export function weeklyAwards(season: SeasonData, now: Date): WeeklyAwards[] {
  const { settled } = auditRegularPeriods(season, now)
  return settled.map((period) => {
    const scores = scoresForPeriod(season, period)
    const top = Math.max(...scores.values())
    const topIds = [...scores.entries()].filter(([, v]) => v === top).map(([id]) => id)

    let blowout: WeeklyAwards['biggestBlowout'] = null
    let unluckiest: WeeklyAwards['unluckiestLoss'] = null
    let luckiest: WeeklyAwards['luckiestWin'] = null
    for (const f of season.fixtures) {
      if (f.period !== period || f.homeScore === null || f.awayScore === null) continue
      if (f.homeScore === f.awayScore) continue
      const [winnerId, winnerScore, loserId, loserScore] =
        f.homeScore > f.awayScore
          ? [f.homeTeamId, f.homeScore, f.awayTeamId, f.awayScore]
          : [f.awayTeamId, f.awayScore, f.homeTeamId, f.homeScore]
      const margin = winnerScore - loserScore
      if (blowout === null || margin > blowout.margin) {
        blowout = { period, winnerId, loserId, winnerScore, loserScore, margin }
      }
      if (unluckiest === null || loserScore > unluckiest.score) {
        unluckiest = { teamId: loserId, score: loserScore }
      }
      if (luckiest === null || winnerScore < luckiest.score) {
        luckiest = { teamId: winnerId, score: winnerScore }
      }
    }
    return {
      period,
      topScore: { teamIds: topIds, score: top },
      biggestBlowout: blowout,
      unluckiestLoss: unluckiest,
      luckiestWin: luckiest,
    }
  })
}
