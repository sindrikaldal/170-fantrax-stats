import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import type { SeasonData } from '@/lib/domain/types'
import { headToHeadMatrix, nemesisAndBunny, revengeFixtures } from '@/lib/stats/rivalries'
import { resolveManagers } from '@/lib/stats/managers'
import { syntheticSeason, SYNTHETIC_SEASON_OVER } from '@/test/helpers/synthetic'
import type { Team } from '@/lib/domain/types'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

const AFTER_SEASON = new Date('2026-08-20')

const resolution = resolveManagers([season2025], {})
const matrix = headToHeadMatrix([season2025], resolution, AFTER_SEASON)
const h2h = (a: string, b: string) =>
  matrix.find((x) => x.managerId === a && x.opponentId === b)!

describe('headToHeadMatrix, 2025 season', () => {
  it('Füllkrug vs Proof the Curse: four meetings, 1-0-3, -16.5 aggregate', () => {
    const x = h2h('the-fullkrug-express', 'proof-the-curse-lives-once-more')
    expect(x.meetings).toHaveLength(4)
    expect([x.wins, x.draws, x.losses]).toEqual([1, 0, 3])
    expect(x.aggregateMargin).toBeCloseTo(-16.5, 6)
  })

  it('the mirrored entry is the exact inverse', () => {
    const x = h2h('proof-the-curse-lives-once-more', 'the-fullkrug-express')
    expect([x.wins, x.draws, x.losses]).toEqual([3, 0, 1])
    expect(x.aggregateMargin).toBeCloseTo(16.5, 6)
  })

  it('Füllkrug swept Leibbi davíðs 4-0-0 by +164', () => {
    const x = h2h('the-fullkrug-express', 'leibbi-davi-s')
    expect([x.wins, x.draws, x.losses]).toEqual([4, 0, 0])
    expect(x.aggregateMargin).toBeCloseTo(164, 6)
  })

  it('an uneven schedule leaves Füllkrug vs Einn ís at three meetings', () => {
    const x = h2h('the-fullkrug-express', 'einn-is-kaldal')
    expect(x.meetings).toHaveLength(3)
  })

  it('meetings are chronological and carry real scores', () => {
    const x = h2h('the-fullkrug-express', 'proof-the-curse-lives-once-more')
    const periods = x.meetings.map((m) => m.period)
    expect(periods).toEqual([...periods].sort((a, b) => a - b))
    for (const m of x.meetings) {
      expect(m.seasonYear).toBe(2025)
      expect(m.margin).toBeCloseTo(m.forScore - m.againstScore, 6)
    }
  })

  it('is empty before the season starts', () => {
    expect(headToHeadMatrix([season2025], resolution, new Date('2025-08-01'))).toEqual([])
  })
})

describe('nemesisAndBunny, 2025 season', () => {
  const verdicts = nemesisAndBunny(matrix)
  const fk = verdicts.find((v) => v.managerId === 'the-fullkrug-express')!

  it("Füllkrug's nemesis is Proof the Curse (-4.125 per meeting)", () => {
    expect(fk.nemesis!.opponentId).toBe('proof-the-curse-lives-once-more')
    expect(fk.nemesis!.avgMargin).toBeCloseTo(-4.125, 6)
  })

  it("Füllkrug's bunny is Earth, Wind & Maguire (+43.19 per meeting)", () => {
    expect(fk.bunny!.opponentId).toBe('earth-wind-maguire')
    expect(fk.bunny!.avgMargin).toBeCloseTo(43.1875, 6)
  })

  it('returns null verdicts when no opponent reaches the meeting minimum', () => {
    const sparse = nemesisAndBunny(matrix, 10)
    for (const v of sparse) {
      expect(v.nemesis).toBeNull()
      expect(v.bunny).toBeNull()
    }
  })
})

describe('revengeFixtures', () => {
  // Same two managers in both seasons, different teamIds — the realistic shape.
  const teams2098: Team[] = [
    { teamId: 'OLD-A', name: 'Alpha FC', shortName: null, logoUrl: null },
    { teamId: 'OLD-B', name: 'Bravo United', shortName: null, logoUrl: null },
  ]
  const teams2099: Team[] = [
    { teamId: 'NEW-A', name: 'Alpha FC', shortName: null, logoUrl: null },
    { teamId: 'NEW-B', name: 'Bravo United', shortName: null, logoUrl: null },
  ]
  // 2098 is fully settled: Alpha beat Bravo in GW1, Bravo won the rematch in GW2.
  const past = syntheticSeason({
    seasonYear: 2098,
    teams: teams2098,
    periods: [
      { number: 1, startDate: '2098-01-01T00:00:00.000Z', endDate: '2098-01-08T00:00:00.000Z' },
      { number: 2, startDate: '2098-01-08T00:00:00.000Z', endDate: '2098-01-15T00:00:00.000Z' },
    ],
    fixtures: [
      { period: 1, homeTeamId: 'OLD-A', awayTeamId: 'OLD-B', homeScore: 100, awayScore: 50 },
      { period: 2, homeTeamId: 'OLD-B', awayTeamId: 'OLD-A', homeScore: 90, awayScore: 60 },
    ],
  })
  // 2099's meeting has not been played; its period ends in the future.
  const current = syntheticSeason({
    seasonYear: 2099,
    teams: teams2099,
    fixtures: [
      { period: 1, homeTeamId: 'NEW-A', awayTeamId: 'NEW-B', homeScore: null, awayScore: null },
    ],
  })
  const resolution = resolveManagers([past, current], {})
  const NOW = new Date('2098-06-01') // 2098 settled, 2099 periods still open

  it('the manager who lost the last meeting is owed revenge', () => {
    const revenge = revengeFixtures([past, current], resolution, NOW)
    expect(revenge).toHaveLength(1)
    expect(revenge[0].managerId).toBe('alpha-fc') // lost the GW2 rematch 60-90
    expect(revenge[0].opponentId).toBe('bravo-united')
    expect(revenge[0].seasonYear).toBe(2099)
    expect(revenge[0].period).toBe(1)
    expect(revenge[0].lastMeeting.margin).toBeCloseTo(-30, 6)
    expect(revenge[0].lastMeeting.seasonYear).toBe(2098)
  })

  it('no revenge when the pair has never met', () => {
    const strangers = syntheticSeason({
      seasonYear: 2099,
      teams: [
        { teamId: 'NEW-A', name: 'Alpha FC', shortName: null, logoUrl: null },
        { teamId: 'NEW-C', name: 'Charlie Town', shortName: null, logoUrl: null },
      ],
      fixtures: [
        { period: 1, homeTeamId: 'NEW-A', awayTeamId: 'NEW-C', homeScore: null, awayScore: null },
      ],
    })
    const r = resolveManagers([past, strangers], {})
    expect(revengeFixtures([past, strangers], r, NOW)).toEqual([])
  })

  it('a fixture in an already-ended period is not upcoming', () => {
    expect(revengeFixtures([past, current], resolution, SYNTHETIC_SEASON_OVER)).toEqual([])
  })
})
