import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'

const info = LeagueInfoSchema.parse(
  JSON.parse(readFileSync('test/fixtures/2025/getLeagueInfo.json', 'utf8')),
)
const schedule = ScheduleResponseSchema.parse(
  JSON.parse(readFileSync('test/fixtures/2025/fxpa-getStandings-schedule.json', 'utf8')),
)

describe('buildSeasonData', () => {
  const season = buildSeasonData(info, schedule, '7he4pkgpme8uz58b')

  it('composes a complete 2025 season', () => {
    expect(season.seasonYear).toBe(2025)
    expect(season.leagueId).toBe('7he4pkgpme8uz58b')
    expect(season.leagueName).toBe('170 Broskis')
    expect(season.teams).toHaveLength(10)
    expect(season.regularSeasonPeriods).toBe(35)
    expect(season.fixtures).toHaveLength(175)
    expect(season.averageFixtures).toHaveLength(350)
  })

  it('merges logo and short name metadata onto teams', () => {
    expect(season.teams.every((t) => t.logoUrl !== null)).toBe(true)
  })

  it('references only known team ids in fixtures', () => {
    const known = new Set(season.teams.map((t) => t.teamId))
    for (const f of season.fixtures) {
      expect(known.has(f.homeTeamId)).toBe(true)
      expect(known.has(f.awayTeamId)).toBe(true)
    }
  })
})
