import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { adaptSchedule, parseScore } from '@/lib/adapt/schedule'

const raw = ScheduleResponseSchema.parse(
  JSON.parse(readFileSync('test/fixtures/2025/fxpa-getStandings-schedule.json', 'utf8')),
)

describe('parseScore', () => {
  it('parses decimal scores', () => {
    expect(parseScore('55.75')).toBe(55.75)
    expect(parseScore('0')).toBe(0)
  })

  it('returns null for blank or unparseable content', () => {
    expect(parseScore('')).toBeNull()
    expect(parseScore('-')).toBeNull()
    expect(parseScore('n/a')).toBeNull()
  })
})

describe('adaptSchedule', () => {
  const r = adaptSchedule(raw)

  it('separates real fixtures from league-average fixtures', () => {
    // 10-team league, 35 gameweeks: 5 real + 10 average per gameweek
    expect(r.fixtures).toHaveLength(5 * 35)
    expect(r.averageFixtures).toHaveLength(10 * 35)
  })

  it('never treats *League Average* as a real team', () => {
    const ids = new Set(r.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]))
    expect(ids.size).toBe(10)
    for (const id of ids) expect(id).not.toBe('')
  })

  it('parses gameweek 1 scores exactly as Fantrax reports them', () => {
    const gw1 = r.fixtures.filter((f) => f.period === 1)
    expect(gw1).toHaveLength(5)
    const scores = gw1.flatMap((f) => [f.awayScore, f.homeScore])
    expect(scores).toContain(55.75)
    expect(scores).toContain(97.5)
    expect(scores).toContain(129.75)
  })

  it('records the league average for gameweek 1 as 101.15', () => {
    const avg = r.averageFixtures.filter((f) => f.period === 1)
    expect(avg).toHaveLength(10)
    for (const a of avg) expect(a.averageScore).toBe(101.15)
  })

  it('confirms the league average is the exact mean of team scores', () => {
    const gw1 = r.averageFixtures.filter((f) => f.period === 1)
    const mean = gw1.reduce((s, a) => s + (a.teamScore ?? 0), 0) / gw1.length
    expect(mean).toBeCloseTo(101.15, 6)
  })

  it('gives every team exactly one average fixture per gameweek', () => {
    for (let p = 1; p <= 35; p++) {
      const ids = r.averageFixtures.filter((f) => f.period === p).map((f) => f.teamId)
      expect(new Set(ids).size).toBe(10)
    }
  })

  it('gives every team exactly one real fixture per gameweek', () => {
    for (let p = 1; p <= 35; p++) {
      const ids = r.fixtures
        .filter((f) => f.period === p)
        .flatMap((f) => [f.homeTeamId, f.awayTeamId])
      expect(new Set(ids).size).toBe(10)
    }
  })

  it('extracts team display metadata including logos', () => {
    expect(r.teamMeta.size).toBe(10)
    const anyMeta = [...r.teamMeta.values()]
    expect(anyMeta.some((m) => m.logoUrl?.startsWith('https://'))).toBe(true)
  })
})
