import type { RawScheduleResponse } from '@/lib/fantrax/schemas'
import type { AverageFixture, Fixture, TeamId } from '@/lib/domain/types'

export interface TeamMeta {
  shortName: string | null
  logoUrl: string | null
}

export interface AdaptedSchedule {
  fixtures: Fixture[]
  averageFixtures: AverageFixture[]
  teamMeta: Map<TeamId, TeamMeta>
}

/** Fantrax sends scores as strings. Blank and placeholder values are not zero. */
export function parseScore(content: string): number | null {
  const trimmed = content.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

// Anchored so a caption like "Round 1" (playoffs) is never mistaken for
// gameweek 1 — only an exact "Gameweek <N>" caption parses.
function parsePeriod(caption: string): number | null {
  const m = caption.trim().match(/^Gameweek\s+(\d+)$/i)
  return m ? Number(m[1]) : null
}

export function adaptSchedule(raw: RawScheduleResponse): AdaptedSchedule {
  const data = raw.responses[0].data
  const fixtures: Fixture[] = []
  const averageFixtures: AverageFixture[] = []
  // A period whose table we've already processed is never processed again.
  // Without this, a second table captioned e.g. "Gameweek 1" (a duplicate,
  // or a mis-captioned playoff round) would append more rows for period 1,
  // and since scoresForPeriod writes into a Map keyed by teamId, those rows
  // would silently overwrite the first table's scores for any team involved
  // — changing an already-paid gameweek's winner retroactively.
  const seenPeriods = new Set<number>()

  for (const table of data.tableList) {
    const period = parsePeriod(table.caption)
    if (period === null) continue
    if (seenPeriods.has(period)) continue
    seenPeriods.add(period)

    for (const row of table.rows) {
      const [awayCell, awayScoreCell, homeCell, homeScoreCell] = row.cells
      if (!awayCell || !homeCell || !awayScoreCell || !homeScoreCell) continue

      // The away side is always a real team. A missing teamId on the home
      // side means this is the team's fixture against *League Average*.
      if (!awayCell.teamId) continue

      if (homeCell.teamId) {
        fixtures.push({
          period,
          awayTeamId: awayCell.teamId,
          homeTeamId: homeCell.teamId,
          awayScore: parseScore(awayScoreCell.content),
          homeScore: parseScore(homeScoreCell.content),
        })
      } else {
        averageFixtures.push({
          period,
          teamId: awayCell.teamId,
          teamScore: parseScore(awayScoreCell.content),
          averageScore: parseScore(homeScoreCell.content),
        })
      }
    }
  }

  const teamMeta = new Map<TeamId, TeamMeta>()
  for (const [teamId, info] of Object.entries(data.fantasyTeamInfo)) {
    teamMeta.set(teamId, {
      shortName: info.shortName ?? null,
      logoUrl: info.logoUrl512 ?? null,
    })
  }

  return { fixtures, averageFixtures, teamMeta }
}
