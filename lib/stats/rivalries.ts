import type { ManagerId, SeasonData } from '@/lib/domain/types'
import { auditRegularPeriods } from '@/lib/domain/season'
import type { ManagerResolution } from './managers'

export interface Meeting {
  seasonYear: number
  period: number
  forScore: number
  againstScore: number
  margin: number
}

export interface HeadToHead {
  managerId: ManagerId
  opponentId: ManagerId
  /** Chronological: season, then gameweek. */
  meetings: Meeting[]
  wins: number
  draws: number
  losses: number
  /** Sum of margins from managerId's point of view. */
  aggregateMargin: number
}

/**
 * Every real meeting between two managers across all given seasons,
 * matched at the manager level so team renames and per-season teamIds
 * do not split a rivalry. One entry per ordered pair; A-vs-B and B-vs-A
 * are mirrors.
 */
export function headToHeadMatrix(
  seasons: SeasonData[],
  resolution: ManagerResolution,
  now: Date,
): HeadToHead[] {
  const managerOfTeam = new Map<string, ManagerId>()
  for (const m of resolution.managers) {
    for (const t of m.teams) managerOfTeam.set(`${t.seasonYear}:${t.teamId}`, m.managerId)
  }

  const pairs = new Map<string, HeadToHead>()
  const record = (
    managerId: ManagerId,
    opponentId: ManagerId,
    meeting: Meeting,
  ) => {
    const key = `${managerId}|${opponentId}`
    const entry =
      pairs.get(key) ??
      { managerId, opponentId, meetings: [], wins: 0, draws: 0, losses: 0, aggregateMargin: 0 }
    entry.meetings.push(meeting)
    entry.aggregateMargin += meeting.margin
    if (meeting.margin > 0) entry.wins += 1
    else if (meeting.margin < 0) entry.losses += 1
    else entry.draws += 1
    pairs.set(key, entry)
  }

  for (const season of [...seasons].sort((a, b) => a.seasonYear - b.seasonYear)) {
    const settled = new Set(auditRegularPeriods(season, now).settled)
    const ordered = [...season.fixtures].sort((a, b) => a.period - b.period)
    for (const f of ordered) {
      if (!settled.has(f.period) || f.homeScore === null || f.awayScore === null) continue
      const home = managerOfTeam.get(`${season.seasonYear}:${f.homeTeamId}`)
      const away = managerOfTeam.get(`${season.seasonYear}:${f.awayTeamId}`)
      if (!home || !away) continue
      record(home, away, {
        seasonYear: season.seasonYear,
        period: f.period,
        forScore: f.homeScore,
        againstScore: f.awayScore,
        margin: f.homeScore - f.awayScore,
      })
      record(away, home, {
        seasonYear: season.seasonYear,
        period: f.period,
        forScore: f.awayScore,
        againstScore: f.homeScore,
        margin: f.awayScore - f.homeScore,
      })
    }
  }
  return [...pairs.values()]
}

export interface RivalVerdict {
  opponentId: ManagerId
  meetings: number
  avgMargin: number
}

export interface NemesisBunny {
  managerId: ManagerId
  /** Worst opponent by average margin, or null until enough meetings exist. */
  nemesis: RivalVerdict | null
  /** Best opponent by average margin. */
  bunny: RivalVerdict | null
}

export function nemesisAndBunny(matrix: HeadToHead[], minMeetings = 2): NemesisBunny[] {
  const byManager = new Map<ManagerId, RivalVerdict[]>()
  for (const h of matrix) {
    if (h.meetings.length < minMeetings) continue
    const list = byManager.get(h.managerId) ?? []
    list.push({
      opponentId: h.opponentId,
      meetings: h.meetings.length,
      avgMargin: h.aggregateMargin / h.meetings.length,
    })
    byManager.set(h.managerId, list)
  }

  const managerIds = [...new Set(matrix.map((h) => h.managerId))]
  return managerIds.map((managerId) => {
    const rivals = byManager.get(managerId) ?? []
    const sorted = [...rivals].sort(
      (a, b) =>
        a.avgMargin - b.avgMargin ||
        b.meetings - a.meetings ||
        a.opponentId.localeCompare(b.opponentId),
    )
    return {
      managerId,
      nemesis: sorted[0] ?? null,
      bunny: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    }
  })
}
