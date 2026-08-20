import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema } from '@/lib/fantrax/schemas'
import { adaptLeagueInfo } from '@/lib/adapt/leagueInfo'

const raw2025 = LeagueInfoSchema.parse(
  JSON.parse(readFileSync('test/fixtures/2025/getLeagueInfo.json', 'utf8')),
)

const raw2026 = LeagueInfoSchema.parse(
  JSON.parse(readFileSync('test/fixtures/2026/getLeagueInfo.json', 'utf8')),
)

describe('adaptLeagueInfo', () => {
  it('extracts league identity and structure', () => {
    const r = adaptLeagueInfo(raw2026)
    expect(r.leagueName).toBe('170 Broskis')
    expect(r.seasonYear).toBe(2026)
    expect(r.regularSeasonPeriods).toBe(35)
    expect(r.totalPeriods).toBe(38)
  })

  it('extracts all 14 teams with stable ids', () => {
    const r = adaptLeagueInfo(raw2026)
    expect(r.teams).toHaveLength(14)
    const names = r.teams.map((t) => t.name)
    expect(names).toContain('The Füllkrug Express')
    expect(names).toContain('Leibbi davíðs')
    // ids must be non-empty and unique
    const ids = new Set(r.teams.map((t) => t.teamId))
    expect(ids.size).toBe(14)
  })

  it('sorts teams by name so output ordering is deterministic', () => {
    const r = adaptLeagueInfo(raw2026)
    const names = r.teams.map((t) => t.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('extracts all 38 periods in ascending order', () => {
    const r = adaptLeagueInfo(raw2026)
    expect(r.periods).toHaveLength(38)
    expect(r.periods[0].number).toBe(1)
    expect(r.periods[37].number).toBe(38)
    expect(r.periods[0].startDate).toContain('2026-08-21')
  })

  it('adapts the playoff team count (2025: 5 of 10)', () => {
    expect(adaptLeagueInfo(raw2025).playoffTeams).toBe(5)
  })

  it('adapts the playoff team count (2026: 7 of 14)', () => {
    expect(adaptLeagueInfo(raw2026).playoffTeams).toBe(7)
  })
})
