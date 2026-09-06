import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { RosterInfoResponseSchema } from '@/lib/fantrax/schemas'
import { adaptRosterInfo } from '@/lib/adapt/rosterInfo'
import { bestLineup, computeBench } from '@/lib/stats/bench'
import type { Fixture, LineupPlayer, LineupSnapshot } from '@/lib/domain/types'
import { syntheticSeason, SYNTHETIC_SEASON_OVER } from '@/test/helpers/synthetic'

const player = (
  id: string,
  positions: LineupPlayer['positions'],
  starter: boolean,
  points: number,
): LineupPlayer => ({ playerId: id, name: id, positions, starter, points })

describe('bestLineup', () => {
  it('Earth, Wind & Maguire GW1 2025: 101.5 was available against 82.5 fielded', () => {
    const raw = RosterInfoResponseSchema.parse(
      JSON.parse(readFileSync('test/fixtures/2025/fxpa-getTeamRosterInfo-p1-byPeriod.json', 'utf8')),
    )
    const roster = adaptRosterInfo(raw, 1)
    const best = bestLineup(roster)
    expect(best.points).toBeCloseTo(101.5, 6)
    expect(best.players).toHaveLength(11)
    // The keeper scored -0.5, so the best lineup leaves the goal empty.
    expect(best.players.some((p) => p.positions.includes('G'))).toBe(false)
    expect(best.players.map((p) => p.name)).toContain('Matthijs de Ligt')
  })

  it('respects position caps: only three of four forwards', () => {
    const roster = [
      player('f1', ['F'], true, 10),
      player('f2', ['F'], true, 9),
      player('f3', ['F'], true, 8),
      player('f4', ['F'], false, 7),
      player('m1', ['M'], true, 1),
    ]
    const best = bestLineup(roster)
    expect(best.points).toBe(28)
    expect(best.players.map((p) => p.playerId).sort()).toEqual(['f1', 'f2', 'f3', 'm1'])
  })

  it('respects the eleven-player cap', () => {
    const roster = [
      ...Array.from({ length: 5 }, (_, i) => player(`d${i}`, ['D'], true, 10)),
      ...Array.from({ length: 5 }, (_, i) => player(`m${i}`, ['M'], true, 10)),
      ...Array.from({ length: 3 }, (_, i) => player(`f${i}`, ['F'], true, 10 - i)),
      player('g', ['G'], true, 5),
    ]
    const best = bestLineup(roster)
    expect(best.players).toHaveLength(11)
    // Five D, five M and the best F fill the eleven; the keeper on 5 and
    // the lesser forwards are left out.
    expect(best.points).toBe(110)
    expect(best.players.some((p) => p.playerId === 'g')).toBe(false)
  })

  it('never fields a player on zero or negative points', () => {
    const roster = [player('a', ['M'], true, -3), player('b', ['M'], true, 0), player('c', ['M'], false, 2)]
    const best = bestLineup(roster)
    expect(best.players.map((p) => p.playerId)).toEqual(['c'])
    expect(best.points).toBe(2)
  })

  it('places a dual-eligible player where it unlocks the most points', () => {
    // Forwards are full of 10s; the flex player belongs at M.
    const roster = [
      player('f1', ['F'], true, 10),
      player('f2', ['F'], true, 10),
      player('f3', ['F'], true, 10),
      player('flex', ['F', 'M'], false, 6),
    ]
    const best = bestLineup(roster)
    expect(best.points).toBe(36)
  })
})

describe('computeBench', () => {
  const fixtures: Fixture[] = [
    { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 20, awayScore: 25 },
    { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 30, awayScore: 10 },
  ]
  const season = syntheticSeason({ fixtures, periodsWithResults: [1] })
  const lineup = (teamId: string, starters: number[], bench: number[], pos: LineupPlayer['positions'] = ['M']) => ({
    teamId,
    players: [
      ...starters.map((pts, i) => player(`${teamId}s${i}`, pos, true, pts)),
      ...bench.map((pts, i) => player(`${teamId}b${i}`, pos, false, pts)),
    ],
  })
  const snapshot: LineupSnapshot = {
    seasonYear: season.seasonYear,
    period: 1,
    final: true,
    capturedAt: '2099-01-09T00:00:00.000Z',
    teams: [
      // A lost 20-25 with three forwards; the cap of three means the
      // 12-point bench forward could only replace the 2-pointer: 30.
      lineup('A', [10, 8, 2], [12], ['F']),
      // B won; bench irrelevant.
      lineup('B', [25], [0]),
      // C won the week with 30; nothing to regret.
      lineup('C', [30], []),
      // D lost 10-30; bench 25 gives 35 which beats everyone: matchup and prize.
      lineup('D', [10], [25]),
    ],
  }
  const report = computeBench(season, [snapshot], SYNTHETIC_SEASON_OVER)
  const row = (id: string) => report.rows.find((r) => r.teamId === id)!

  it('measures regret against the recorded score', () => {
    expect(row('A').actual).toBe(20)
    expect(row('A').optimal).toBe(30)
    expect(row('A').regret).toBe(10)
    expect(row('A').benchPoints).toBe(12)
    expect(row('A').shouldHaveStarted.map((p) => p.playerId)).toEqual(['Ab0'])
  })

  it('flags a matchup a better lineup would have won', () => {
    expect(row('A').wouldHaveWonMatchup).toBe(true)
    expect(row('A').wouldHaveTakenPrize).toBe(false) // 30 does not beat C's 30 outright
    expect(row('B').wouldHaveWonMatchup).toBe(false)
    expect(row('C').regret).toBe(0)
  })

  it('flags the prize a better lineup would have taken and prices it', () => {
    expect(row('D').wouldHaveWonMatchup).toBe(true)
    expect(row('D').wouldHaveTakenPrize).toBe(true)
    const d = report.entries.find((e) => e.teamId === 'D')!
    expect(d.iskBenched).toBe(1500)
    expect(d.wouldHaveTakenPrizes).toBe(1)
    expect(d.worstWeek?.period).toBe(1)
  })

  it('ranks the biggest regret first and reports coverage', () => {
    expect(report.entries[0].teamId).toBe('D')
    expect(report.periods).toEqual([1])
    expect(report.throughPeriod).toBe(1)
    expect(report.missingPeriods).toEqual([])
    expect(report.inProgressPeriods).toEqual([])
  })

  it('drops a snapshot whose starters disagree with the schedule', () => {
    const bad: LineupSnapshot = {
      ...snapshot,
      teams: snapshot.teams.map((t) => (t.teamId === 'A' ? lineup('A', [99], []) : t)),
    }
    const r = computeBench(season, [bad], SYNTHETIC_SEASON_OVER)
    expect(r.inconsistentPeriods).toEqual([1])
    expect(r.rows).toHaveLength(0)
  })

  it('leaves a gameweek in progress out, even with a snapshot', () => {
    const inProgress = { ...season, periodsWithResults: [1] }
    const r = computeBench(inProgress, [snapshot], new Date('2099-01-05'))
    expect(r.inProgressPeriods).toEqual([1])
    expect(r.periods).toEqual([])
    expect(r.rows).toHaveLength(0)
    expect(r.missingPeriods).toEqual([])
  })

  it('reports settled periods without a snapshot as missing', () => {
    const r = computeBench(season, [], SYNTHETIC_SEASON_OVER)
    expect(r.missingPeriods).toEqual([1])
    expect(r.throughPeriod).toBeNull()
  })
})
