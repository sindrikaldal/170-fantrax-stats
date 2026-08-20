import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import {
  scoresForPeriod,
  isPeriodComplete,
  completedRegularPeriods,
} from '@/lib/domain/season'

const season = buildSeasonData(
  LeagueInfoSchema.parse(
    JSON.parse(readFileSync('test/fixtures/2025/getLeagueInfo.json', 'utf8')),
  ),
  ScheduleResponseSchema.parse(
    JSON.parse(readFileSync('test/fixtures/2025/fxpa-getStandings-schedule.json', 'utf8')),
  ),
  '7he4pkgpme8uz58b',
)

describe('scoresForPeriod', () => {
  it('returns one score per team', () => {
    const scores = scoresForPeriod(season, 1)
    expect(scores.size).toBe(10)
  })

  it('returns the real reported scores for gameweek 1', () => {
    const values = [...scoresForPeriod(season, 1).values()].sort((a, b) => a - b)
    expect(values[0]).toBe(55.75)
    expect(values[values.length - 1]).toBe(143)
  })

  it('returns an empty map for a period with no fixtures', () => {
    expect(scoresForPeriod(season, 99).size).toBe(0)
  })
})

describe("Fantrax's date format", () => {
  it('parses, despite not being standard ISO 8601', () => {
    // Fantrax sends '2025-08-22T14:59:59.0-0400': a single-digit fractional
    // second and an offset with no colon. V8 accepts this, but the format is
    // outside the spec, so assert it explicitly rather than letting engine
    // leniency hide a future break.
    const raw = season.periods[0].endDate
    expect(raw).toBe('2025-08-22T14:59:59.0-0400')
    expect(Number.isNaN(new Date(raw).getTime())).toBe(false)
  })
})

describe('isPeriodComplete', () => {
  it('is true once the period end date has passed', () => {
    expect(isPeriodComplete(season, 1, new Date('2026-01-01'))).toBe(true)
  })

  it('is false before the period has ended', () => {
    expect(isPeriodComplete(season, 1, new Date('2025-08-16'))).toBe(false)
  })

  it('is false for an unknown period', () => {
    expect(isPeriodComplete(season, 99, new Date('2030-01-01'))).toBe(false)
  })
})

describe('completedRegularPeriods', () => {
  it('returns all 35 regular-season gameweeks for a finished season', () => {
    const done = completedRegularPeriods(season, new Date('2026-08-20'))
    expect(done).toHaveLength(35)
    expect(done[0]).toBe(1)
    expect(done[34]).toBe(35)
  })

  it('excludes playoff periods even when they are complete', () => {
    const done = completedRegularPeriods(season, new Date('2030-01-01'))
    expect(done).toHaveLength(35)
    expect(done).not.toContain(36)
  })

  it('returns nothing before the season starts', () => {
    expect(completedRegularPeriods(season, new Date('2025-08-01'))).toEqual([])
  })
})

import { auditRegularPeriods, maxFixturesPerPeriod } from './season'
import { syntheticSeason, SYNTHETIC_SEASON_OVER } from '@/test/helpers/synthetic'

describe('auditRegularPeriods', () => {
  it('settles all 35 gameweeks of the complete 2025 season', () => {
    const audit = auditRegularPeriods(season, new Date('2026-08-20'))
    expect(audit.settled).toHaveLength(35)
    expect(audit.settled[0]).toBe(1)
    expect(audit.settled[34]).toBe(35)
    expect(audit.withheld).toEqual([])
  })

  it('withholds a period whose fixture rows were truncated during parsing', () => {
    // Period 1 has the full complement of 2 fixtures; period 2 lost a row
    // during parsing, but its surviving row carries complete scores. The
    // old per-period guard cannot see this; the max-fixtures guard can.
    const s = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 8, awayScore: 3 },
        { period: 2, homeTeamId: 'A', awayTeamId: 'B', homeScore: 12, awayScore: 7 },
      ],
    })
    const audit = auditRegularPeriods(s, SYNTHETIC_SEASON_OVER)
    expect(audit.settled).toEqual([1])
    expect(audit.withheld).toEqual([2])
  })

  it('withholds an all-zero period (unplayed gameweek posted as "0" scores)', () => {
    const s = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 0, awayScore: 0 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 0, awayScore: 0 },
      ],
    })
    const audit = auditRegularPeriods(s, SYNTHETIC_SEASON_OVER)
    expect(audit.settled).toEqual([])
    expect(audit.withheld).toEqual([1])
  })

  it('withholds a period with partial scores', () => {
    const s = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: null, awayScore: null },
      ],
    })
    const audit = auditRegularPeriods(s, SYNTHETIC_SEASON_OVER)
    expect(audit.settled).toEqual([])
    expect(audit.withheld).toEqual([1])
  })

  it('neither settles nor withholds periods that have not ended', () => {
    const s = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 8, awayScore: 3 },
      ],
    })
    const audit = auditRegularPeriods(s, new Date('2026-08-20'))
    expect(audit.settled).toEqual([])
    expect(audit.withheld).toEqual([])
  })
})

describe('maxFixturesPerPeriod', () => {
  it('is 5 for the 10-team 2025 season', () => {
    expect(maxFixturesPerPeriod(season)).toBe(5)
  })

  it('is 0 for a season with no fixtures', () => {
    expect(maxFixturesPerPeriod(syntheticSeason())).toBe(0)
  })
})
