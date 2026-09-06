import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import { readLineupSnapshots } from '@/lib/lineups/snapshot'
import { computeBench } from '@/lib/stats/bench'
import type { SeasonData } from '@/lib/domain/types'

/**
 * Regression values against the committed 2025 lineup snapshots. Like the
 * ledger's 2025 values these are pinned, not derived: if they move, the
 * algorithm or the data changed, and that needs explaining rather than
 * re-pinning.
 */
const load = (f: string) => JSON.parse(readFileSync(`test/fixtures/2025/${f}`, 'utf8'))
const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load('getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load('fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)
const nameOf = (s: SeasonData, id: string) => s.teams.find((t) => t.teamId === id)!.name

describe('computeBench, committed 2025 lineups', () => {
  const report = computeBench(season2025, readLineupSnapshots(2025), new Date('2026-08-20'))

  it('covers every regular-season gameweek for every team', () => {
    expect(report.periods).toHaveLength(35)
    expect(report.rows).toHaveLength(350)
    expect(report.missingPeriods).toEqual([])
    expect(report.inconsistentPeriods).toEqual([])
    expect(report.inProgressPeriods).toEqual([])
  })

  it('regret is never negative: the fielded eleven is itself a legal lineup', () => {
    expect(Math.min(...report.rows.map((r) => r.regret))).toBe(0)
    for (const r of report.rows) expect(r.optimal).toBeGreaterThanOrEqual(r.actual - 1e-9)
  })

  it('Earth, Wind & Maguire left the most on the bench: 402.5 points', () => {
    const top = report.entries[0]
    expect(nameOf(season2025, top.teamId)).toBe('Earth, Wind & Maguire')
    expect(top.regretTotal).toBeCloseTo(402.5, 6)
    // More than their raw bench points, because starters on negative
    // points count as regret too.
    expect(top.benchPointsTotal).toBeCloseTo(356.5, 6)
  })

  it('the worst single week was The Füllkrug Express in gameweek 10: 57 points, Xhaka 29.5', () => {
    const worst = report.rows.reduce((a, b) => (b.regret > a.regret ? b : a))
    expect(nameOf(season2025, worst.teamId)).toBe('The Füllkrug Express')
    expect(worst.period).toBe(10)
    expect(worst.regret).toBeCloseTo(57, 6)
    expect(worst.actual).toBe(111.25)
    expect(worst.shouldHaveStarted[0].name).toBe('Granit Xhaka')
    expect(worst.shouldHaveStarted[0].points).toBe(29.5)
  })

  it('a better lineup would have taken 20 gameweek prizes worth 30,000 ISK, five of them Füllkrug', () => {
    const prizes = report.entries.reduce((s, e) => s + e.wouldHaveTakenPrizes, 0)
    expect(prizes).toBe(20)
    expect(report.entries.reduce((s, e) => s + e.iskBenched, 0)).toBe(30000)
    const fk = report.entries.find((e) => nameOf(season2025, e.teamId) === 'The Füllkrug Express')!
    expect(fk.wouldHaveTakenPrizes).toBe(5)
    expect(fk.iskBenched).toBe(7500)
    expect(fk.wouldHaveWonMatchups).toBe(5)
  })

  it('FC Slaughterhouse! would have won eight more matchups', () => {
    const fcs = report.entries.find((e) => nameOf(season2025, e.teamId) === 'FC Slaughterhouse!')!
    expect(fcs.wouldHaveWonMatchups).toBe(8)
  })
})
