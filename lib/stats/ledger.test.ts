import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import { computeLedger, PRIZE_PER_GAMEWEEK } from '@/lib/stats/ledger'
import type { SeasonData } from '@/lib/domain/types'
import { syntheticSeason, SYNTHETIC_SEASON_OVER } from '@/test/helpers/synthetic'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

const AFTER_SEASON = new Date('2026-08-20')
const nameOf = (s: SeasonData, id: string) => s.teams.find((t) => t.teamId === id)!.name

describe('computeLedger, 2025 season', () => {
  const ledger = computeLedger(season2025, AFTER_SEASON)

  it('counts all 35 regular-season gameweeks', () => {
    expect(ledger.gameweeksCounted).toBe(35)
    expect(ledger.gameweeks).toHaveLength(35)
  })

  it('pays out exactly the fixed pool of 52,500 ISK', () => {
    expect(ledger.totalPaid).toBeCloseTo(35 * PRIZE_PER_GAMEWEEK, 6)
    expect(ledger.totalPaid).toBeCloseTo(52500, 6)
  })

  it('entry ISK sums to the total paid', () => {
    const sum = ledger.entries.reduce((s, e) => s + e.isk, 0)
    expect(sum).toBeCloseTo(ledger.totalPaid, 6)
  })

  it('ranks The Füllkrug Express top on 8 wins and 12,000 ISK', () => {
    const top = ledger.entries[0]
    expect(nameOf(season2025, top.teamId)).toBe('The Füllkrug Express')
    expect(top.gameweekWins).toBe(8)
    expect(top.isk).toBeCloseTo(12000, 6)
  })

  it('splits the gameweek 16 tie 750/750', () => {
    const gw16 = ledger.gameweeks.find((g) => g.period === 16)!
    expect(gw16.winners).toHaveLength(2)
    expect(gw16.topScore).toBe(114.25)
    expect(gw16.iskPerWinner).toBeCloseTo(750, 6)
    const names = gw16.winners.map((id) => nameOf(season2025, id)).sort()
    expect(names).toEqual(['Haaland, Sakalegur markaskorari', 'Proof the Curse lives once more'])
  })

  it('counts a shared win as one win but pays half', () => {
    const haaland = ledger.entries.find(
      (e) => nameOf(season2025, e.teamId) === 'Haaland, Sakalegur markaskorari',
    )!
    expect(haaland.gameweekWins).toBe(5)
    expect(haaland.isk).toBeCloseTo(6750, 6)
  })

  it('gives every team at least one gameweek win', () => {
    expect(ledger.entries).toHaveLength(10)
    expect(ledger.entries.every((e) => e.gameweekWins >= 1)).toBe(true)
  })

  it('sorts entries by ISK descending', () => {
    const isks = ledger.entries.map((e) => e.isk)
    expect(isks).toEqual([...isks].sort((a, b) => b - a))
  })

  it('never awards a prize to the league-average pseudo-team', () => {
    const known = new Set(season2025.teams.map((t) => t.teamId))
    for (const g of ledger.gameweeks) {
      for (const w of g.winners) expect(known.has(w)).toBe(true)
    }
  })
})

describe('computeLedger, incomplete and empty seasons', () => {
  it('counts nothing before the season starts', () => {
    const ledger = computeLedger(season2025, new Date('2025-08-01'))
    expect(ledger.gameweeksCounted).toBe(0)
    expect(ledger.gameweeks).toEqual([])
    expect(ledger.totalPaid).toBe(0)
    expect(ledger.entries).toEqual([])
  })

  it('counts only gameweeks that have finished', () => {
    // Verified against the fixture: period 1 ends 2025-08-22, period 2 ends
    // 2025-08-29, and period 3 not until 2025-09-12 (international break).
    // So on 2025-08-30 exactly two gameweeks are complete.
    const ledger = computeLedger(season2025, new Date('2025-08-30'))
    expect(ledger.gameweeksCounted).toBe(2)
    expect(ledger.gameweeks.map((g) => g.period)).toEqual([1, 2])
    expect(ledger.totalPaid).toBeCloseTo(2 * PRIZE_PER_GAMEWEEK, 6)
  })

  it('excludes playoff gameweeks from the pool', () => {
    const ledger = computeLedger(season2025, new Date('2030-01-01'))
    expect(ledger.gameweeksCounted).toBe(35)
    expect(ledger.gameweeks.some((g) => g.period > 35)).toBe(false)
  })

  it('honours a custom prize amount', () => {
    const ledger = computeLedger(season2025, AFTER_SEASON, 100)
    expect(ledger.totalPaid).toBeCloseTo(3500, 6)
  })
})

// Fantrax reports an unplayed gameweek's score as the literal string "0"
// rather than leaving it blank, so `parseScore` turns it into 0, not null.
// That means `scoresForPeriod` does NOT omit those teams, and a date-only
// completeness check (`isPeriodComplete`) has already decided the period is
// "done" once its end date has passed — even though nobody has played it.
// These synthetic seasons exercise `computeLedger`'s guards against that
// directly, without touching the irreplaceable fixtures under test/fixtures.

describe('computeLedger, unplayed gameweeks reported as all-zero or partial scores', () => {
  it('does not pay a gameweek where every team is reported at 0', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 0, awayScore: 0 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 0, awayScore: 0 },
      ],
    })
    const ledger = computeLedger(season, SYNTHETIC_SEASON_OVER)
    expect(ledger.gameweeksCounted).toBe(0)
    expect(ledger.gameweeks).toEqual([])
    expect(ledger.totalPaid).toBe(0)
    expect(ledger.entries).toEqual([])
  })

  it('does not pay a gameweek where only some teams have reported scores', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: null, awayScore: null },
      ],
    })
    const ledger = computeLedger(season, SYNTHETIC_SEASON_OVER)
    expect(ledger.gameweeksCounted).toBe(0)
    expect(ledger.gameweeks).toEqual([])
    expect(ledger.totalPaid).toBe(0)
  })

  it('still pays a gameweek with full, non-zero scores (guard is not over-aggressive)', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 8, awayScore: 3 },
      ],
    })
    const ledger = computeLedger(season, SYNTHETIC_SEASON_OVER)
    expect(ledger.gameweeksCounted).toBe(1)
    expect(ledger.totalPaid).toBeCloseTo(PRIZE_PER_GAMEWEEK, 6)
    expect(ledger.gameweeks[0].winners).toEqual(['A'])
    expect(ledger.gameweeks[0].topScore).toBe(10)
    expect(ledger.periodsWithheld).toBe(0)
  })

  it('counts an all-zero completed period as withheld, not simply absent', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 0, awayScore: 0 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 0, awayScore: 0 },
      ],
    })
    const ledger = computeLedger(season, SYNTHETIC_SEASON_OVER)
    expect(ledger.gameweeksCounted).toBe(0)
    expect(ledger.periodsWithheld).toBe(1)
  })
})

describe('computeLedger, team-count vs period-fixture-count cache skew', () => {
  it('still pays a period when season.teams has more entries than that period accounts for', () => {
    // Simulates a 15th manager joining mid-season: `fetchLeagueInfo` caches
    // for 24h and `fetchSchedule` for 30min, so a newly-added team can show
    // up in `season.teams` well before it has ever appeared in a fixture.
    // The completeness guard must derive its expected score count from this
    // period's own fixtures, not from `season.teams.length`, or every
    // period — including ones with real, complete scores — would wrongly
    // fail the guard until the caches resync.
    const season = syntheticSeason({
      teams: [
        { teamId: 'A', name: 'Team A', shortName: null, logoUrl: null },
        { teamId: 'B', name: 'Team B', shortName: null, logoUrl: null },
        { teamId: 'C', name: 'Team C', shortName: null, logoUrl: null },
        { teamId: 'D', name: 'Team D', shortName: null, logoUrl: null },
        { teamId: 'E', name: 'Team E (just joined)', shortName: null, logoUrl: null },
      ],
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 8, awayScore: 3 },
      ],
    })
    const ledger = computeLedger(season, SYNTHETIC_SEASON_OVER)
    expect(ledger.gameweeksCounted).toBe(1)
    expect(ledger.periodsWithheld).toBe(0)
    expect(ledger.totalPaid).toBeCloseTo(PRIZE_PER_GAMEWEEK, 6)
    expect(ledger.gameweeks[0].winners).toEqual(['A'])
  })
})

describe('computeLedger, truncated fixture rows', () => {
  it('withholds a period whose fixture rows were truncated during parsing', () => {
    // Period 2 lost its C–D row during parsing; the surviving A–B row has
    // complete, non-zero scores. Without the max-fixtures guard the ledger
    // would pay period 2's prize to A among the survivors.
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 8, awayScore: 3 },
        { period: 2, homeTeamId: 'A', awayTeamId: 'B', homeScore: 12, awayScore: 7 },
      ],
    })
    const ledger = computeLedger(season, SYNTHETIC_SEASON_OVER)
    expect(ledger.gameweeksCounted).toBe(1)
    expect(ledger.gameweeks.map((g) => g.period)).toEqual([1])
    expect(ledger.periodsWithheld).toBe(1)
    expect(ledger.totalPaid).toBeCloseTo(PRIZE_PER_GAMEWEEK, 6)
  })
})
