import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema, StandingsSchema } from '@/lib/fantrax/schemas'

const load = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

describe('LeagueInfoSchema', () => {
  it('parses the 2026 league info fixture', () => {
    const parsed = LeagueInfoSchema.parse(load('test/fixtures/2026/getLeagueInfo.json'))
    expect(parsed.leagueName).toBe('170 Broskis')
    expect(parsed.seasonYear).toBe(2026)
    expect(parsed.scoringPeriods).toHaveLength(38)
    expect(parsed.playoffs.lastRegularSeasonPeriod).toBe(35)
    expect(Object.keys(parsed.teamInfo)).toHaveLength(14)
  })

  it('parses the 2025 league info fixture, which has 10 teams', () => {
    const parsed = LeagueInfoSchema.parse(load('test/fixtures/2025/getLeagueInfo.json'))
    expect(parsed.seasonYear).toBe(2025)
    expect(Object.keys(parsed.teamInfo)).toHaveLength(10)
  })
})

describe('ScheduleResponseSchema', () => {
  it('parses all 35 gameweek tables from the 2025 fixture', () => {
    const parsed = ScheduleResponseSchema.parse(
      load('test/fixtures/2025/fxpa-getStandings-schedule.json'),
    )
    const tables = parsed.responses[0].data.tableList
    expect(tables).toHaveLength(35)
    expect(tables[0].caption).toBe('Gameweek 1')
    // 5 real matchups + 10 league-average rows for a 10-team league
    expect(tables[0].rows).toHaveLength(15)
  })
})

describe('StandingsSchema', () => {
  it('parses the 2025 final standings', () => {
    const parsed = StandingsSchema.parse(load('test/fixtures/2025/getStandings.json'))
    expect(parsed).toHaveLength(10)
    expect(parsed[0].teamName).toBe('Leibbi davíðs')
  })
})
