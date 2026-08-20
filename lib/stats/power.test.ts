import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import { powerRankings } from '@/lib/stats/power'
import type { SeasonData } from '@/lib/domain/types'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

const AFTER_SEASON = new Date('2026-08-20')
const nameOf = (s: SeasonData, id: string) => s.teams.find((t) => t.teamId === id)!.name

describe('powerRankings, 2025 season', () => {
  const power = powerRankings(season2025, AFTER_SEASON)

  it('ranks the league after gameweek 35', () => {
    expect(power.map((p) => nameOf(season2025, p.teamId))).toEqual([
      'Einn ís Kaldal',
      'Leibbi davíðs',
      'The Füllkrug Express',
      'Proof the Curse lives once more',
      'les Homms',
      'Year of the Diallo',
      'FC Slaughterhouse!',
      'Haaland, Sakalegur markaskorari',
      'Palm Air',
      'Earth, Wind & Maguire',
    ])
    expect(power.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('computes the blended score: Einn ís Kaldal at 0.6606', () => {
    expect(power[0].score).toBeCloseTo(0.6606, 3)
  })

  it('tracks weekly movement: Proof climbed past les Homms in the final week', () => {
    const proof = power.find((p) => nameOf(season2025, p.teamId) === 'Proof the Curse lives once more')!
    expect(proof.previousRank).toBe(5)
    expect(proof.movement).toBe(1)
    const homms = power.find((p) => nameOf(season2025, p.teamId) === 'les Homms')!
    expect(homms.previousRank).toBe(4)
    expect(homms.movement).toBe(-1)
  })

  it('is empty with no settled gameweeks', () => {
    expect(powerRankings(season2025, new Date('2025-08-01'))).toEqual([])
  })

  it('has null movement when only one gameweek exists', () => {
    // Period 1 ends 2025-08-22; only it is settled on 2025-08-23.
    const single = powerRankings(season2025, new Date('2025-08-23'))
    expect(single).toHaveLength(10)
    for (const p of single) {
      expect(p.previousRank).toBeNull()
      expect(p.movement).toBeNull()
    }
  })
})
