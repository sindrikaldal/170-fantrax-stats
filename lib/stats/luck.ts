import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods, scoresForPeriod } from '@/lib/domain/season'
import { rankTable, realRecords, type TeamRecord, winPoints } from './tables'

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

export interface ScheduleSwapEntry {
  teamId: TeamId
  /** Other teams' schedules under which this team would make the playoffs. */
  playoffCount: number
  schedulesTried: number
}

/**
 * "You would make playoffs under 11 of 13 schedules." For each other team
 * U, replay this team's weekly scores against U's real fixture list (when
 * U's opponent that week is this team, face U's score instead), substitute
 * the swapped record for this team's row in the real-only table, and count
 * a playoff finish (top season.playoffTeams by win points, points-for
 * tiebreak).
 */
export function scheduleSwap(season: SeasonData, now: Date): ScheduleSwapEntry[] {
  const { settled } = auditRegularPeriods(season, now)
  if (settled.length === 0) return []

  const scoresByPeriod = new Map(settled.map((p) => [p, scoresForPeriod(season, p)]))
  const opponentOf = new Map<string, TeamId>()
  for (const f of season.fixtures) {
    if (!scoresByPeriod.has(f.period)) continue
    opponentOf.set(`${f.period}:${f.homeTeamId}`, f.awayTeamId)
    opponentOf.set(`${f.period}:${f.awayTeamId}`, f.homeTeamId)
  }

  const real = realRecords(season, now)
  const teamIds = season.teams.map((t) => t.teamId)

  const entries = teamIds.map((teamId) => {
    let playoffCount = 0
    for (const otherId of teamIds) {
      if (otherId === teamId) continue
      const swapped: TeamRecord = {
        teamId,
        wins: 0,
        draws: 0,
        losses: 0,
        pointsFor: real.get(teamId)?.pointsFor ?? 0,
        pointsAgainst: 0,
        games: 0,
      }
      for (const [period, scores] of scoresByPeriod) {
        const myScore = scores.get(teamId)
        if (myScore === undefined) continue
        const opponent = opponentOf.get(`${period}:${otherId}`)
        if (opponent === undefined) continue
        const oppScore = opponent === teamId ? scores.get(otherId) : scores.get(opponent)
        if (oppScore === undefined) continue
        swapped.games += 1
        if (myScore > oppScore) swapped.wins += 1
        else if (myScore < oppScore) swapped.losses += 1
        else swapped.draws += 1
      }
      const rows = new Map(real)
      rows.set(teamId, swapped)
      const rank = rankTable(rows).findIndex((r) => r.teamId === teamId) + 1
      if (rank <= season.playoffTeams) playoffCount += 1
    }
    return { teamId, playoffCount, schedulesTried: teamIds.length - 1 }
  })

  return entries.sort(
    (a, b) => b.playoffCount - a.playoffCount || a.teamId.localeCompare(b.teamId),
  )
}

export interface PointsAgainstEntry {
  teamId: TeamId
  pointsAgainst: number
  /** Losses where the opponent posted the gameweek's top score. */
  lossesToTopScore: number
}

/** Hardest slate faced, plus how often the schedule served up the buzzsaw. */
export function pointsAgainstTable(season: SeasonData, now: Date): PointsAgainstEntry[] {
  const { settled } = auditRegularPeriods(season, now)
  const settledSet = new Set(settled)
  const real = realRecords(season, now)
  const losses = new Map<TeamId, number>()

  for (const period of settled) {
    const scores = scoresForPeriod(season, period)
    if (scores.size === 0) continue
    const top = Math.max(...scores.values())
    for (const f of season.fixtures) {
      if (f.period !== period || f.homeScore === null || f.awayScore === null) continue
      const [loser, loserScore, winnerScore] =
        f.homeScore < f.awayScore
          ? [f.homeTeamId, f.homeScore, f.awayScore]
          : [f.awayTeamId, f.awayScore, f.homeScore]
      if (winnerScore > loserScore && winnerScore === top) {
        losses.set(loser, (losses.get(loser) ?? 0) + 1)
      }
    }
  }

  return [...real.values()]
    .map((r) => ({
      teamId: r.teamId,
      pointsAgainst: r.pointsAgainst,
      lossesToTopScore: losses.get(r.teamId) ?? 0,
    }))
    .sort((a, b) => b.pointsAgainst - a.pointsAgainst || a.teamId.localeCompare(b.teamId))
}

export interface CloseGameReport {
  /** |margin| at the given percentile of this season's own distribution. */
  threshold: number
  marginsSampled: number
  records: Map<TeamId, TeamRecord>
}

/** Record in nail-biters. The threshold comes from the league's own margins. */
export function closeGameRecords(
  season: SeasonData,
  now: Date,
  percentile = 0.25,
): CloseGameReport {
  const settled = new Set(auditRegularPeriods(season, now).settled)
  const played = season.fixtures.filter(
    (f) => settled.has(f.period) && f.homeScore !== null && f.awayScore !== null,
  )
  const margins = played
    .map((f) => Math.abs((f.homeScore as number) - (f.awayScore as number)))
    .sort((a, b) => a - b)

  const records = new Map<TeamId, TeamRecord>(
    season.teams.map((t) => [
      t.teamId,
      { teamId: t.teamId, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 },
    ]),
  )
  if (margins.length === 0) return { threshold: 0, marginsSampled: 0, records }

  const threshold = margins[Math.floor(percentile * (margins.length - 1))]
  for (const f of played) {
    const home = f.homeScore as number
    const away = f.awayScore as number
    if (Math.abs(home - away) > threshold) continue
    for (const [id, mine, theirs] of [
      [f.homeTeamId, home, away],
      [f.awayTeamId, away, home],
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
  return { threshold, marginsSampled: margins.length, records }
}

export interface ThresholdPoint {
  period: number
  /** The league mean that gameweek — score above it and you beat the average. */
  threshold: number
}

/** The moving bar: what it took to beat the league mean, week by week. */
export function averageThresholds(season: SeasonData, now: Date): ThresholdPoint[] {
  const { settled } = auditRegularPeriods(season, now)
  return settled.map((period) => {
    const scores = [...scoresForPeriod(season, period).values()]
    const threshold = scores.reduce((s, x) => s + x, 0) / scores.length
    return { period, threshold }
  })
}
