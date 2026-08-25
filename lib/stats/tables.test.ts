import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import {
  averageRecords,
  combinedRecords,
  rankTable,
  realRecords,
  winPoints,
} from '@/lib/stats/tables'
import type { SeasonData } from '@/lib/domain/types'
import { syntheticSeason, SYNTHETIC_SEASON_OVER } from '@/test/helpers/synthetic'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

const AFTER_SEASON = new Date('2026-08-20')
const idOf = (s: SeasonData, name: string) => s.teams.find((t) => t.name === name)!.teamId
const nameOf = (s: SeasonData, id: string) => s.teams.find((t) => t.teamId === id)!.name

describe('records, 2025 season', () => {
  const real = realRecords(season2025, AFTER_SEASON)
  const avg = averageRecords(season2025, AFTER_SEASON)
  const combined = combinedRecords(season2025, AFTER_SEASON)

  it('combined records reproduce the final published standings exactly', () => {
    // From test/fixtures/2025/getStandings.json "points" strings.
    const published: Record<string, string> = {
      'Leibbi davíðs': '43-1-26',
      'Einn ís Kaldal': '42-0-28',
      'The Füllkrug Express': '41-0-29',
      'Proof the Curse lives once more': '37-0-33',
      'Year of the Diallo': '35-0-35',
      'les Homms': '34-0-36',
      'Palm Air': '29-0-41',
      'Haaland, Sakalegur markaskorari': '28-1-41',
      'FC Slaughterhouse!': '28-0-42',
      'Earth, Wind & Maguire': '20-0-50',
    }
    for (const [name, wdl] of Object.entries(published)) {
      const r = combined.get(idOf(season2025, name))!
      expect(`${r.wins}-${r.draws}-${r.losses}`, name).toBe(wdl)
    }
  })

  it('counts each gameweek score once in the combined table, not twice', () => {
    // getStandings.json reports 6944 for Leibbi davíðs: Fantrax adds the same
    // weekly score to both fixtures. 3472 is what the team actually scored.
    const published: Record<string, number> = {
      'Leibbi davíðs': 6944,
      'The Füllkrug Express': 7211,
      'Proof the Curse lives once more': 6132,
      'Earth, Wind & Maguire': 5004.5,
    }
    for (const [name, fantraxTotal] of Object.entries(published)) {
      const r = combined.get(idOf(season2025, name))!
      expect(r.games, name).toBe(70)
      expect(r.pointsFor, name).toBeCloseTo(fantraxTotal / 2, 6)
    }
  })

  it('ranks the combined table identically to Fantrax despite the halved PF', () => {
    // Halving is monotonic, so the points-for tiebreak is unaffected.
    expect(rankTable(combined).map((r) => nameOf(season2025, r.teamId))).toEqual([
      'Leibbi davíðs',
      'Einn ís Kaldal',
      'The Füllkrug Express',
      'Proof the Curse lives once more',
      'Year of the Diallo',
      'les Homms',
      'Palm Air',
      'Haaland, Sakalegur markaskorari',
      'FC Slaughterhouse!',
      'Earth, Wind & Maguire',
    ])
  })

  it('splits Leibbi davíðs into 20-1-14 real and 23-0-12 vs the average', () => {
    const id = idOf(season2025, 'Leibbi davíðs')
    const r = real.get(id)!
    expect([r.wins, r.draws, r.losses, r.games]).toEqual([20, 1, 14, 35])
    expect(r.pointsFor).toBeCloseTo(3472, 6)
    expect(r.pointsAgainst).toBeCloseTo(3244.5, 6)
    const a = avg.get(id)!
    expect([a.wins, a.draws, a.losses]).toEqual([23, 0, 12])
  })

  it('real-only table: Einn ís Kaldal top on 24-0-11, Slaughterhouse bottom', () => {
    const table = rankTable(real)
    expect(nameOf(season2025, table[0].teamId)).toBe('Einn ís Kaldal')
    expect([table[0].wins, table[0].draws, table[0].losses]).toEqual([24, 0, 11])
    expect(nameOf(season2025, table[9].teamId)).toBe('FC Slaughterhouse!')
    expect(table.map((r) => nameOf(season2025, r.teamId))).toEqual([
      'Einn ís Kaldal',
      'Proof the Curse lives once more',
      'Leibbi davíðs',
      'The Füllkrug Express',
      'les Homms',
      'Haaland, Sakalegur markaskorari',
      'Palm Air',
      'Year of the Diallo',
      'Earth, Wind & Maguire',
      'FC Slaughterhouse!',
    ])
  })

  it('average-only table tells a different story: Leibbi top, Diallo 3rd', () => {
    const table = rankTable(avg)
    expect(table.map((r) => nameOf(season2025, r.teamId))).toEqual([
      'Leibbi davíðs',
      'The Füllkrug Express',
      'Year of the Diallo',
      'Einn ís Kaldal',
      'FC Slaughterhouse!',
      'les Homms',
      'Proof the Curse lives once more',
      'Palm Air',
      'Haaland, Sakalegur markaskorari',
      'Earth, Wind & Maguire',
    ])
  })

  it('breaks the 19-win tie between Füllkrug and les Homms on points-for', () => {
    const table = rankTable(real)
    const fk = table.findIndex((r) => nameOf(season2025, r.teamId) === 'The Füllkrug Express')
    const lh = table.findIndex((r) => nameOf(season2025, r.teamId) === 'les Homms')
    expect(winPoints(table[fk])).toBe(19)
    expect(winPoints(table[lh])).toBe(19)
    expect(fk).toBeLessThan(lh) // 3605.5 points-for beats 3237.75
  })

  it('is all zeros before the season starts', () => {
    const real = realRecords(season2025, new Date('2025-08-01'))
    for (const r of real.values()) {
      expect([r.wins, r.draws, r.losses, r.games, r.pointsFor]).toEqual([0, 0, 0, 0, 0])
    }
  })
})

describe('combined table, one gameweek played', () => {
  it('shows a 140-point gameweek as 140 over two games, not 280', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 140, awayScore: 100 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 90, awayScore: 70 },
      ],
      averageFixtures: [
        { period: 1, teamId: 'A', teamScore: 140, averageScore: 100 },
        { period: 1, teamId: 'B', teamScore: 100, averageScore: 100 },
        { period: 1, teamId: 'C', teamScore: 90, averageScore: 100 },
        { period: 1, teamId: 'D', teamScore: 70, averageScore: 100 },
      ],
      periodsWithResults: [1],
    })
    const a = combinedRecords(season, SYNTHETIC_SEASON_OVER).get('A')!
    expect(a.games).toBe(2)
    expect(a.wins).toBe(2)
    expect(a.pointsFor).toBe(140)
    expect(a.pointsAgainst).toBe(200) // two different opponents: 100 + 100
  })

  it('still counts the score when a team has no league-average row that week', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 140, awayScore: 100 },
      ],
      averageFixtures: [{ period: 1, teamId: 'B', teamScore: 100, averageScore: 120 }],
      periodsWithResults: [1],
    })
    const combined = combinedRecords(season, SYNTHETIC_SEASON_OVER)
    expect(combined.get('A')!.pointsFor).toBe(140)
    expect(combined.get('A')!.games).toBe(1)
    expect(combined.get('B')!.pointsFor).toBe(100)
    expect(combined.get('B')!.games).toBe(2)
  })
})
