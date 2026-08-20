import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import type { SeasonData } from '@/lib/domain/types'
import { headToHeadMatrix, nemesisAndBunny } from '@/lib/stats/rivalries'
import { resolveManagers } from '@/lib/stats/managers'

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
