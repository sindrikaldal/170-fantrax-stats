import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import { computeLedger } from '@/lib/stats/ledger'
import { computeRunnersUp } from '@/lib/stats/runnerUp'
import type { Fixture, SeasonData } from '@/lib/domain/types'
import { syntheticSeason, SYNTHETIC_SEASON_OVER } from '@/test/helpers/synthetic'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

const AFTER_SEASON = new Date('2026-08-20')
const nameOf = (s: SeasonData, id: string) => s.teams.find((t) => t.teamId === id)!.name

describe('computeRunnersUp, 2025 season', () => {
  const report = computeRunnersUp(season2025, AFTER_SEASON)

  it('finds a runner-up in every one of the 35 gameweeks', () => {
    expect(report.gameweeks).toHaveLength(35)
    expect(report.entries.reduce((s, e) => s + e.finishes, 0)).toBe(35)
  })

  it('agrees with the ledger on which gameweeks exist', () => {
    const ledger = computeLedger(season2025, AFTER_SEASON)
    expect(report.gameweeks.map((g) => g.period)).toEqual(ledger.gameweeks.map((g) => g.period))
    for (const gw of report.gameweeks) {
      expect(gw.topScore).toBe(ledger.gameweeks.find((g) => g.period === gw.period)!.topScore)
    }
  })

  it('gameweek 1: FC Slaughterhouse! second on 129.75, 13.25 behind', () => {
    const gw1 = report.gameweeks.find((g) => g.period === 1)!
    expect(gw1.topScore).toBe(143)
    expect(gw1.runnerUpScore).toBe(129.75)
    expect(gw1.gap).toBeCloseTo(13.25, 6)
    expect(gw1.runnersUp.map((id) => nameOf(season2025, id))).toEqual(['FC Slaughterhouse!'])
  })

  it('a tie at the top makes the next score down the runner-up (gameweek 16)', () => {
    const gw16 = report.gameweeks.find((g) => g.period === 16)!
    expect(gw16.topScore).toBe(114.25)
    expect(gw16.runnerUpScore).toBe(105)
    expect(gw16.runnersUp.map((id) => nameOf(season2025, id))).toEqual(['Leibbi davíðs'])
  })

  it('Year of the Diallo were the nearly men: 7 finishes, 10,500 ISK one place off', () => {
    const top = report.entries[0]
    expect(nameOf(season2025, top.teamId)).toBe('Year of the Diallo')
    expect(top.finishes).toBe(7)
    expect(top.iskOnePlaceOff).toBe(7 * 1500)
    expect(top.totalPointsShort).toBeCloseTo(108, 6)
    expect(top.narrowestMiss).toBeCloseTo(2.5, 6)
  })

  it('The Füllkrug Express missed by a quarter of a point once', () => {
    const e = report.entries.find((x) => nameOf(season2025, x.teamId) === 'The Füllkrug Express')!
    expect(e.finishes).toBe(4)
    expect(e.narrowestMiss).toBeCloseTo(0.25, 6)
  })

  it('never credits a runner-up more than the full prize per finish', () => {
    for (const e of report.entries) {
      expect(e.iskOnePlaceOff).toBe(e.finishes * report.prizePerGameweek)
    }
  })
})

describe('computeRunnersUp, ties among runners-up', () => {
  const fixtures: Fixture[] = [
    { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 100, awayScore: 90 },
    { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 90, awayScore: 50 },
  ]
  const season = syntheticSeason({ fixtures, periodsWithResults: [1] })
  const report = computeRunnersUp(season, SYNTHETIC_SEASON_OVER)

  it('counts every team on the second-highest score, each at the full prize', () => {
    const gw = report.gameweeks[0]
    expect(gw.runnersUp.sort()).toEqual(['B', 'C'])
    expect(gw.gap).toBe(10)
    for (const id of ['B', 'C']) {
      const e = report.entries.find((x) => x.teamId === id)!
      expect(e.finishes).toBe(1)
      expect(e.iskOnePlaceOff).toBe(1500)
    }
  })
})

describe('computeRunnersUp, degenerate weeks', () => {
  it('a week where every team tied has no runner-up', () => {
    const fixtures: Fixture[] = [
      { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 80, awayScore: 80 },
      { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 80, awayScore: 80 },
    ]
    const season = syntheticSeason({ fixtures, periodsWithResults: [1] })
    expect(computeRunnersUp(season, SYNTHETIC_SEASON_OVER).gameweeks).toHaveLength(0)
  })

  it('reports nothing before any gameweek is settled', () => {
    const fixtures: Fixture[] = [
      { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: null, awayScore: null },
      { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: null, awayScore: null },
    ]
    const season = syntheticSeason({ fixtures })
    const report = computeRunnersUp(season, SYNTHETIC_SEASON_OVER)
    expect(report.gameweeks).toHaveLength(0)
    expect(report.entries).toHaveLength(0)
  })
})

describe('computeRunnersUp, gameweek in progress', () => {
  it('skips a published gameweek whose window is still open, like the ledger', () => {
    const fixtures: Fixture[] = [
      { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 90, awayScore: 60 },
      { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 70, awayScore: 50 },
    ]
    const season = syntheticSeason({ fixtures, periodsWithResults: [1] })
    expect(computeRunnersUp(season, new Date('2099-01-05')).gameweeks).toEqual([])
    expect(computeRunnersUp(season, SYNTHETIC_SEASON_OVER).gameweeks).toHaveLength(1)
  })
})
