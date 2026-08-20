import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods } from '@/lib/domain/season'

export interface TeamRecord {
  teamId: TeamId
  wins: number
  draws: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  games: number
}

/** Fantrax ranks by wins plus half a point per draw. */
export function winPoints(r: Pick<TeamRecord, 'wins' | 'draws'>): number {
  return r.wins + 0.5 * r.draws
}

function blankRecords(season: SeasonData): Map<TeamId, TeamRecord> {
  return new Map(
    season.teams.map((t) => [
      t.teamId,
      { teamId: t.teamId, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 },
    ]),
  )
}

function tally(r: TeamRecord, forScore: number, againstScore: number): void {
  r.games += 1
  r.pointsFor += forScore
  r.pointsAgainst += againstScore
  if (forScore > againstScore) r.wins += 1
  else if (forScore < againstScore) r.losses += 1
  else r.draws += 1
}

/** Real-opponent record over settled periods. Half of every team's games. */
export function realRecords(season: SeasonData, now: Date): Map<TeamId, TeamRecord> {
  const settled = new Set(auditRegularPeriods(season, now).settled)
  const records = blankRecords(season)
  for (const f of season.fixtures) {
    if (!settled.has(f.period) || f.homeScore === null || f.awayScore === null) continue
    const home = records.get(f.homeTeamId)
    const away = records.get(f.awayTeamId)
    if (!home || !away) continue
    tally(home, f.homeScore, f.awayScore)
    tally(away, f.awayScore, f.homeScore)
  }
  return records
}

/** Record against *League Average* over settled periods. Near-pure skill. */
export function averageRecords(season: SeasonData, now: Date): Map<TeamId, TeamRecord> {
  const settled = new Set(auditRegularPeriods(season, now).settled)
  const records = blankRecords(season)
  for (const f of season.averageFixtures) {
    if (!settled.has(f.period) || f.teamScore === null || f.averageScore === null) continue
    const r = records.get(f.teamId)
    if (!r) continue
    tally(r, f.teamScore, f.averageScore)
  }
  return records
}

/** The official table: real and league-average fixtures summed. */
export function combinedRecords(season: SeasonData, now: Date): Map<TeamId, TeamRecord> {
  const real = realRecords(season, now)
  const avg = averageRecords(season, now)
  const combined = blankRecords(season)
  for (const [id, c] of combined) {
    for (const part of [real.get(id), avg.get(id)]) {
      if (!part) continue
      c.wins += part.wins
      c.draws += part.draws
      c.losses += part.losses
      c.pointsFor += part.pointsFor
      c.pointsAgainst += part.pointsAgainst
      c.games += part.games
    }
  }
  return combined
}

/** Win points desc, points-for desc, teamId asc — deterministic. */
export function rankTable(records: Map<TeamId, TeamRecord>): TeamRecord[] {
  return [...records.values()].sort(
    (a, b) =>
      winPoints(b) - winPoints(a) ||
      b.pointsFor - a.pointsFor ||
      a.teamId.localeCompare(b.teamId),
  )
}
