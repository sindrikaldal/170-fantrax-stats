import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import { allPlayRecords, luckIndex, scheduleSwap, pointsAgainstTable, closeGameRecords, averageThresholds } from '@/lib/stats/luck'
import type { SeasonData } from '@/lib/domain/types'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

const AFTER_SEASON = new Date('2026-08-20')
const idOf = (s: SeasonData, name: string) => s.teams.find((t) => t.name === name)!.teamId
const nameOf = (s: SeasonData, id: string) => s.teams.find((t) => t.teamId === id)!.name

describe('allPlayRecords, 2025 season', () => {
  const ap = allPlayRecords(season2025, AFTER_SEASON)

  it('Leibbi davíðs leads on 197 of 315', () => {
    const r = ap.get(idOf(season2025, 'Leibbi davíðs'))!
    expect(r.points).toBeCloseTo(197, 6)
    expect(r.games).toBe(315) // 35 gameweeks x 9 opponents
    expect(r.winPct).toBeCloseTo(197 / 315, 6)
  })

  it('Earth, Wind & Maguire trails on 91 of 315', () => {
    const r = ap.get(idOf(season2025, 'Earth, Wind & Maguire'))!
    expect(r.points).toBeCloseTo(91, 6)
  })

  it('total points across teams is one all-play tournament per gameweek', () => {
    const total = [...ap.values()].reduce((s, r) => s + r.points, 0)
    // 35 gameweeks x C(10,2) pairings, 1 point distributed per pairing
    expect(total).toBeCloseTo(35 * 45, 6)
  })
})

describe('luckIndex, 2025 season', () => {
  const luck = luckIndex(season2025, AFTER_SEASON)

  it('Year of the Diallo was the unluckiest team in the league: -7.5', () => {
    const last = luck[luck.length - 1]
    expect(nameOf(season2025, last.teamId)).toBe('Year of the Diallo')
    expect(last.actualWinPoints).toBeCloseTo(14, 6)
    expect(last.expectedWinPoints).toBeCloseTo(21.5, 6)
    expect(last.delta).toBeCloseTo(-7.5, 6)
  })

  it('Proof the Curse was the luckiest: +5.06', () => {
    expect(nameOf(season2025, luck[0].teamId)).toBe('Proof the Curse lives once more')
    expect(luck[0].delta).toBeCloseTo(5.0556, 3)
  })

  it('Einn ís Kaldal rode +4.78 of schedule luck to the real-table title', () => {
    const e = luck.find((x) => nameOf(season2025, x.teamId) === 'Einn ís Kaldal')!
    expect(e.actualWinPoints).toBeCloseTo(24, 6)
    expect(e.delta).toBeCloseTo(4.7778, 3)
  })

  it('is empty before the season starts', () => {
    expect(luckIndex(season2025, new Date('2025-08-01'))).toEqual([])
  })
})

describe('scheduleSwap, 2025 season (5 playoff spots)', () => {
  const swap = scheduleSwap(season2025, AFTER_SEASON)
  const entry = (name: string) => swap.find((e) => nameOf(season2025, e.teamId) === name)!

  it('tries the 9 other schedules for each team', () => {
    expect(swap).toHaveLength(10)
    for (const e of swap) expect(e.schedulesTried).toBe(9)
  })

  it('les Homms missed the playoffs but makes it under all 9 other schedules', () => {
    expect(entry('les Homms').playoffCount).toBe(9)
  })

  it('Füllkrug and Diallo also make it under all 9', () => {
    expect(entry('The Füllkrug Express').playoffCount).toBe(9)
    expect(entry('Year of the Diallo').playoffCount).toBe(9)
  })

  it('Proof the Curse finished 2nd in the real table but survives only 5 of 9 swaps', () => {
    expect(entry('Proof the Curse lives once more').playoffCount).toBe(5)
  })

  it('the bottom teams make it under almost no schedule', () => {
    expect(entry('FC Slaughterhouse!').playoffCount).toBe(1)
    expect(entry('Palm Air').playoffCount).toBe(0)
    expect(entry('Haaland, Sakalegur markaskorari').playoffCount).toBe(0)
    expect(entry('Earth, Wind & Maguire').playoffCount).toBe(0)
  })

  it('is empty before the season starts', () => {
    expect(scheduleSwap(season2025, new Date('2025-08-01'))).toEqual([])
  })
})

describe('pointsAgainstTable, 2025 season', () => {
  const pa = pointsAgainstTable(season2025, AFTER_SEASON)

  it('Year of the Diallo faced the hardest slate: 3601.25 against, 7 losses to the top score', () => {
    expect(nameOf(season2025, pa[0].teamId)).toBe('Year of the Diallo')
    expect(pa[0].pointsAgainst).toBeCloseTo(3601.25, 6)
    expect(pa[0].lossesToTopScore).toBe(7)
  })

  it('The Füllkrug Express lost to the gameweek top score only twice', () => {
    const e = pa.find((x) => nameOf(season2025, x.teamId) === 'The Füllkrug Express')!
    expect(e.pointsAgainst).toBeCloseTo(3092.5, 6)
    expect(e.lossesToTopScore).toBe(2)
  })
})

describe('closeGameRecords, 2025 season', () => {
  const close = closeGameRecords(season2025, AFTER_SEASON)

  it('derives the threshold from the 25th percentile of the margin distribution', () => {
    expect(close.threshold).toBeCloseTo(10.5, 6)
    expect(close.marginsSampled).toBe(175) // 35 gameweeks x 5 real fixtures
  })

  it('Einn ís Kaldal won every one of its nine close games', () => {
    const r = close.records.get(idOf(season2025, 'Einn ís Kaldal'))!
    expect([r.wins, r.draws, r.losses]).toEqual([9, 0, 0])
  })

  it('FC Slaughterhouse! lost 11 of its 12 close games', () => {
    const r = close.records.get(idOf(season2025, 'FC Slaughterhouse!'))!
    expect([r.wins, r.draws, r.losses]).toEqual([1, 0, 11])
  })

  it("Leibbi davíðs' lone draw counts as a close game", () => {
    const r = close.records.get(idOf(season2025, 'Leibbi davíðs'))!
    expect([r.wins, r.draws, r.losses]).toEqual([6, 1, 6])
  })
})

describe('averageThresholds, 2025 season', () => {
  const thresholds = averageThresholds(season2025, AFTER_SEASON)

  it('produces one threshold per settled gameweek', () => {
    expect(thresholds).toHaveLength(35)
    expect(thresholds[0].period).toBe(1)
    expect(thresholds[34].period).toBe(35)
  })

  it('gameweek 1 needed 101.15 (the fixture-documented league average)', () => {
    expect(thresholds[0].threshold).toBeCloseTo(101.15, 6)
  })

  it('gameweek 35 needed 95.775', () => {
    expect(thresholds[34].threshold).toBeCloseTo(95.775, 6)
  })
})
