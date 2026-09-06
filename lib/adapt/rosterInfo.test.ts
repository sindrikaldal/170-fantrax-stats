import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { RosterInfoResponseSchema } from '@/lib/fantrax/schemas'
import { adaptRosterInfo, RosterInfoShapeError } from '@/lib/adapt/rosterInfo'

const load = (f: string) => JSON.parse(readFileSync(`test/fixtures/2025/${f}`, 'utf8'))

describe('adaptRosterInfo, Earth, Wind & Maguire gameweek 1 (BY_PERIOD)', () => {
  const raw = RosterInfoResponseSchema.parse(load('fxpa-getTeamRosterInfo-p1-byPeriod.json'))
  const players = adaptRosterInfo(raw, 1)

  it('reads all 14 rostered players and skips empty slots and totals rows', () => {
    expect(players).toHaveLength(14)
    expect(players.filter((p) => p.starter)).toHaveLength(11)
    expect(players.filter((p) => !p.starter)).toHaveLength(3)
  })

  it("starters' points sum to the team's recorded 82.5 for the week", () => {
    const sum = players.filter((p) => p.starter).reduce((s, p) => s + p.points, 0)
    expect(sum).toBeCloseTo(82.5, 6)
  })

  it('keeps bench points: de Ligt scored 13.5 from the reserves', () => {
    const deLigt = players.find((p) => p.name === 'Matthijs de Ligt')!
    expect(deLigt.starter).toBe(false)
    expect(deLigt.points).toBe(13.5)
    expect(deLigt.positions).toEqual(['D'])
  })

  it('maps every position id and keeps negative scores', () => {
    const alisson = players.find((p) => p.name === 'Alisson Becker')!
    expect(alisson.positions).toEqual(['G'])
    expect(alisson.points).toBe(-0.5)
    expect(new Set(players.flatMap((p) => p.positions))).toEqual(new Set(['G', 'D', 'M', 'F']))
  })

  it('refuses a response for a different period', () => {
    expect(() => adaptRosterInfo(raw, 2)).toThrow(RosterInfoShapeError)
  })

  it('refuses a response for a different team', () => {
    // The fixture is the commissioner's team, which Fantrax returns for any
    // unrecognised team parameter; a caller asking for another team must
    // not silently get it.
    expect(() => adaptRosterInfo(raw, 1, 'w7k5s20pme8uz58i')).toThrow(/asked for team/)
    expect(adaptRosterInfo(raw, 1, 'qzs8m54qme8uz58j')).toHaveLength(14)
  })

  it('refuses season-to-date figures', () => {
    const ytd = RosterInfoResponseSchema.parse(load('fxpa-getTeamRosterInfo-p5.json'))
    expect(() => adaptRosterInfo(ytd, 5)).toThrow(/BY_PERIOD/)
  })
})
