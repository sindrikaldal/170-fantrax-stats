import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods, scoresForPeriod } from '@/lib/domain/season'
import { realRecords, winPoints } from './tables'

export interface AllPlayRecord {
  teamId: TeamId
  /** 1 per team outscored in a gameweek, 0.5 per tie, summed over settled gameweeks. */
  points: number
  /** Opponents faced: (teams that gameweek - 1), summed. */
  games: number
  winPct: number
}

/** Every gameweek scored against the whole league, not just one opponent. */
export function allPlayRecords(season: SeasonData, now: Date): Map<TeamId, AllPlayRecord> {
  const { settled } = auditRegularPeriods(season, now)
  const acc = new Map<TeamId, { points: number; games: number }>()
  for (const period of settled) {
    const scores = scoresForPeriod(season, period)
    for (const [teamId, score] of scores) {
      const a = acc.get(teamId) ?? { points: 0, games: 0 }
      for (const [otherId, otherScore] of scores) {
        if (otherId === teamId) continue
        a.games += 1
        if (score > otherScore) a.points += 1
        else if (score === otherScore) a.points += 0.5
      }
      acc.set(teamId, a)
    }
  }
  return new Map(
    [...acc.entries()].map(([teamId, a]) => [
      teamId,
      { teamId, points: a.points, games: a.games, winPct: a.games ? a.points / a.games : 0 },
    ]),
  )
}

export interface LuckEntry {
  teamId: TeamId
  /** Win points actually banked from real fixtures. */
  actualWinPoints: number
  /** Win points an average schedule would have paid: all-play share per gameweek. */
  expectedWinPoints: number
  /** Positive = lucky. "+7 on what you deserved." */
  delta: number
}

/** Schedule luck: the gap between the record you have and the one you earned. */
export function luckIndex(season: SeasonData, now: Date): LuckEntry[] {
  const { settled } = auditRegularPeriods(season, now)
  if (settled.length === 0) return []

  const expected = new Map<TeamId, number>()
  for (const period of settled) {
    const scores = scoresForPeriod(season, period)
    if (scores.size < 2) continue
    for (const [teamId, score] of scores) {
      let points = 0
      for (const [otherId, otherScore] of scores) {
        if (otherId === teamId) continue
        if (score > otherScore) points += 1
        else if (score === otherScore) points += 0.5
      }
      expected.set(teamId, (expected.get(teamId) ?? 0) + points / (scores.size - 1))
    }
  }

  const real = realRecords(season, now)
  const entries: LuckEntry[] = [...expected.entries()].map(([teamId, exp]) => {
    const record = real.get(teamId)
    const actual = record ? winPoints(record) : 0
    return { teamId, actualWinPoints: actual, expectedWinPoints: exp, delta: actual - exp }
  })
  return entries.sort((a, b) => b.delta - a.delta || a.teamId.localeCompare(b.teamId))
}
