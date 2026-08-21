import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import { adaptLeagueInfo } from '@/lib/adapt/leagueInfo'
import { resolveManagers, slugifyManagerId } from '@/lib/stats/managers'
import { syntheticSeason } from '@/test/helpers/synthetic'
import type { SeasonData } from '@/lib/domain/types'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

// There is no committed 2026 schedule response (pre-season capture), so the
// 2026 SeasonData is assembled from the real 2026 league info plus empty
// fixture lists. Team identity is all this module needs.
const info2026 = adaptLeagueInfo(LeagueInfoSchema.parse(load(2026, 'getLeagueInfo.json')))
const season2026: SeasonData = {
  seasonYear: info2026.seasonYear,
  leagueId: 'ywhebyp7msyix1sj',
  leagueName: info2026.leagueName,
  regularSeasonPeriods: info2026.regularSeasonPeriods,
  totalPeriods: info2026.totalPeriods,
  playoffTeams: info2026.playoffTeams,
  teams: info2026.teams,
  periods: info2026.periods,
  fixtures: [],
  averageFixtures: [],
}

describe('slugifyManagerId', () => {
  it('strips diacritics and punctuation deterministically', () => {
    expect(slugifyManagerId('The Füllkrug Express')).toBe('the-fullkrug-express')
    expect(slugifyManagerId('Leibbi davíðs')).toBe('leibbi-davi-s')
    expect(slugifyManagerId('Earth, Wind & Maguire')).toBe('earth-wind-maguire')
    expect(slugifyManagerId('FC Slaughterhouse!')).toBe('fc-slaughterhouse')
  })
})

describe('resolveManagers across 2025 and 2026', () => {
  const resolution = resolveManagers([season2025, season2026], {})

  it('finds exactly the eight returning managers', () => {
    const names = resolution.returning.map((m) => m.displayName).sort()
    expect(names).toEqual([
      'Einn ís Kaldal',
      'FC Slaughterhouse!',
      'Haaland, Sakalegur markaskorari',
      'Leibbi davíðs',
      'Proof the Curse lives once more',
      'The Füllkrug Express',
      'Year of the Diallo',
      'les Homms',
    ])
  })

  it('surfaces single-season teams explicitly instead of dropping them', () => {
    const names = resolution.singleSeason.map((m) => m.displayName).sort()
    expect(names).toEqual([
      'Earth, Wind & Maguire', // 2025 only
      'Jonoli',
      'Palm Air', // 2025 only
      'Sgudmundsson',
      "Slot's Guld",
      'arnibarnason',
      'fannaroa',
      'hordurb',
    ])
  })

  it('accounts for every team in both seasons exactly once', () => {
    const teamCount = resolution.managers.reduce((s, m) => s + m.teams.length, 0)
    expect(teamCount).toBe(season2025.teams.length + season2026.teams.length) // 10 + 14
    expect(resolution.managers).toHaveLength(16) // 8 returning + 8 single-season
  })

  it('a returning manager carries both seasons in year order', () => {
    const fk = resolution.returning.find((m) => m.managerId === 'the-fullkrug-express')!
    expect(fk.teams.map((t) => t.seasonYear)).toEqual([2025, 2026])
    expect(fk.teams[0].teamId).toBe('xc98xpvcme8uz58j')
    expect(fk.teams[1].teamId).toBe('6y6vpiv2msyix1uy')
  })

  it('an override reunites a renamed team with its manager', () => {
    const renamed = syntheticSeason({
      seasonYear: 2027,
      teams: [{ teamId: 'NEW1', name: 'Totally New Name FC', shortName: null, logoUrl: null }],
    })
    const r = resolveManagers([season2025, renamed], { NEW1: 'the-fullkrug-express' })
    const fk = r.returning.find((m) => m.managerId === 'the-fullkrug-express')!
    expect(fk.teams.map((t) => t.seasonYear)).toEqual([2025, 2027])
    expect(fk.displayName).toBe('Totally New Name FC') // most recent season's name
  })

  it('throws when two teams in one season resolve to the same manager', () => {
    const dupes = syntheticSeason({
      seasonYear: 2027,
      teams: [
        { teamId: 'X1', name: 'Same Name', shortName: null, logoUrl: null },
        { teamId: 'X2', name: 'Same Name', shortName: null, logoUrl: null },
      ],
    })
    expect(() => resolveManagers([dupes], {})).toThrow(/same manager/i)
  })
})
