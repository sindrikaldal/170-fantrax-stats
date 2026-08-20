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
