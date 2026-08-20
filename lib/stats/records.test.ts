import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import { scoreExtremes, streaks, formTable, scoreDistributions, biggestCollapses, weeklyAwards } from '@/lib/stats/records'
import type { SeasonData } from '@/lib/domain/types'
import { syntheticSeason, SYNTHETIC_SEASON_OVER } from '@/test/helpers/synthetic'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

const AFTER_SEASON = new Date('2026-08-20')
const idOf = (s: SeasonData, name: string) => s.teams.find((t) => t.name === name)!.teamId
const nameOf = (s: SeasonData, id: string) => s.teams.find((t) => t.teamId === id)!.name

describe('scoreExtremes, 2025 season', () => {
  const { highest, lowest } = scoreExtremes(season2025, AFTER_SEASON)

  it('Leibbi davíðs posted the season high: 173.5 in gameweek 33', () => {
    expect(nameOf(season2025, highest!.teamId)).toBe('Leibbi davíðs')
    expect(highest!.period).toBe(33)
    expect(highest!.score).toBeCloseTo(173.5, 6)
  })

  it('Earth, Wind & Maguire posted the season low: 16.25 in gameweek 29', () => {
    expect(nameOf(season2025, lowest!.teamId)).toBe('Earth, Wind & Maguire')
    expect(lowest!.period).toBe(29)
    expect(lowest!.score).toBeCloseTo(16.25, 6)
  })

  it('is null-null before the season starts', () => {
    expect(scoreExtremes(season2025, new Date('2025-08-01'))).toEqual({
      highest: null,
      lowest: null,
    })
  })
})

describe('streaks, 2025 season', () => {
  const all = streaks(season2025, AFTER_SEASON)
  const of = (name: string) => all.find((s) => nameOf(season2025, s.teamId) === name)!

  it('Proof the Curse ran the longest win streak: 7', () => {
    expect(of('Proof the Curse lives once more').longestWin).toBe(7)
  })

  it('FC Slaughterhouse! suffered the longest losing streak: 7', () => {
    expect(of('FC Slaughterhouse!').longestLoss).toBe(7)
  })

  it('Einn ís Kaldal finished the season on a four-game win run', () => {
    const e = of('Einn ís Kaldal')
    expect(e.lastFive).toEqual(['L', 'W', 'W', 'W', 'W'])
    expect(e.current).toEqual({ type: 'W', length: 4 })
  })

  it('a team with no games has no current streak', () => {
    const empty = streaks(season2025, new Date('2025-08-01'))
    for (const s of empty) {
      expect(s.current).toBeNull()
      expect(s.lastFive).toEqual([])
      expect(s.longestWin).toBe(0)
    }
  })
})

describe('formTable, 2025 season', () => {
  const form = formTable(season2025, AFTER_SEASON)

  it('covers gameweeks 30-35', () => {
    expect(form.window).toBe(6)
    expect(form.periods).toEqual([30, 31, 32, 33, 34, 35])
  })

  it('Einn ís Kaldal tops the form table on 5-0-1', () => {
    const top = form.rows[0]
    expect(nameOf(season2025, top.teamId)).toBe('Einn ís Kaldal')
    expect([top.wins, top.draws, top.losses]).toEqual([5, 0, 1])
    expect(top.pointsFor).toBeCloseTo(550.5, 6)
  })

  it('breaks the 2-0-4 logjam by points scored in the window', () => {
    // Five teams finished 2-0-4 over GWs 30-35; window points-for orders them.
    expect(form.rows.slice(5).map((r) => nameOf(season2025, r.teamId))).toEqual([
      'Year of the Diallo', // 719.25
      'Palm Air', // 492.25
      'Haaland, Sakalegur markaskorari', // 473.75
      'les Homms', // 435.5
      'Earth, Wind & Maguire', // 292.5
    ])
  })

  it('shrinks the window honestly early in a season', () => {
    // On 2025-08-30 exactly two gameweeks are settled (verified in ledger tests).
    const early = formTable(season2025, new Date('2025-08-30'))
    expect(early.periods).toEqual([1, 2])
    expect(early.window).toBe(6)
  })
})

describe('scoreDistributions, 2025 season', () => {
  const dists = scoreDistributions(season2025, AFTER_SEASON)
  const of = (name: string) => dists.find((d) => nameOf(season2025, d.teamId) === name)!

  it('The Füllkrug Express is the boom-or-bust king: sd 30.65 on mean 103.01', () => {
    expect(nameOf(season2025, dists[0].teamId)).toBe('The Füllkrug Express')
    expect(dists[0].stdDev).toBeCloseTo(30.65, 1)
    expect(dists[0].mean).toBeCloseTo(103.01, 1)
    expect(dists[0].scores).toHaveLength(35)
  })

  it('Proof the Curse is the metronome: sd 23.08', () => {
    expect(of('Proof the Curse lives once more').stdDev).toBeCloseTo(23.08, 1)
  })

  it('scores carry their gameweek for charting', () => {
    const fk = of('The Füllkrug Express')
    expect(fk.scores[0].period).toBe(1)
    expect(fk.scores.map((s) => s.period)).toEqual([...Array(35)].map((_, i) => i + 1))
  })
})

describe('biggestCollapses, 2025 season', () => {
  it('FC Slaughterhouse! fell off a cliff: 156.5 to 41.75 between GW33 and 34', () => {
    const collapses = biggestCollapses(season2025, AFTER_SEASON)
    const worst = collapses[0]
    expect(nameOf(season2025, worst.teamId)).toBe('FC Slaughterhouse!')
    expect(worst.fromPeriod).toBe(33)
    expect(worst.toPeriod).toBe(34)
    expect(worst.fromScore).toBeCloseTo(156.5, 6)
    expect(worst.toScore).toBeCloseTo(41.75, 6)
    expect(worst.drop).toBeCloseTo(114.75, 6)
  })
})

describe('weeklyAwards, 2025 season', () => {
  const awards = weeklyAwards(season2025, AFTER_SEASON)

  it('hands out awards for all 35 gameweeks', () => {
    expect(awards).toHaveLength(35)
    expect(awards.map((a) => a.period)).toEqual([...Array(35)].map((_, i) => i + 1))
  })

  it('gameweek 1: Haaland tops on 143', () => {
    const gw1 = awards[0]
    expect(gw1.topScore.score).toBeCloseTo(143, 6)
    expect(gw1.topScore.teamIds.map((id) => nameOf(season2025, id))).toEqual([
      'Haaland, Sakalegur markaskorari',
    ])
  })

  it('gameweek 1: les Homms blew out Palm Air by 41.75', () => {
    const b = awards[0].biggestBlowout!
    expect(nameOf(season2025, b.winnerId)).toBe('les Homms')
    expect(nameOf(season2025, b.loserId)).toBe('Palm Air')
    expect(b.winnerScore).toBeCloseTo(97.5, 6)
    expect(b.loserScore).toBeCloseTo(55.75, 6)
    expect(b.margin).toBeCloseTo(41.75, 6)
  })

  it('gameweek 1: Füllkrug scored 123.25 and still lost; EWM won with 82.5', () => {
    expect(nameOf(season2025, awards[0].unluckiestLoss!.teamId)).toBe('The Füllkrug Express')
    expect(awards[0].unluckiestLoss!.score).toBeCloseTo(123.25, 6)
    expect(nameOf(season2025, awards[0].luckiestWin!.teamId)).toBe('Earth, Wind & Maguire')
    expect(awards[0].luckiestWin!.score).toBeCloseTo(82.5, 6)
  })

  it('gameweek 16: the tied top score is shared', () => {
    const gw16 = awards[15]
    expect(gw16.topScore.teamIds).toHaveLength(2)
    expect(gw16.topScore.score).toBeCloseTo(114.25, 6)
  })

  it('an all-drawn gameweek has a top score but no decisive awards', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 50, awayScore: 50 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 60, awayScore: 60 },
      ],
    })
    const a = weeklyAwards(season, SYNTHETIC_SEASON_OVER)
    expect(a).toHaveLength(1)
    expect(a[0].topScore.teamIds.sort()).toEqual(['C', 'D'])
    expect(a[0].biggestBlowout).toBeNull()
    expect(a[0].unluckiestLoss).toBeNull()
    expect(a[0].luckiestWin).toBeNull()
  })
})
