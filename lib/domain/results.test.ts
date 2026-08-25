import { describe, it, expect } from 'vitest'
import { auditRegularPeriods } from '@/lib/domain/season'
import { syntheticSeason } from '@/test/helpers/synthetic'
import type { Fixture } from '@/lib/domain/types'

/**
 * Synthetic period 1 runs 2099-01-01 to 2099-01-08, so this `now` sits
 * inside the window: the gameweek's matches are done but Fantrax has not
 * closed the period yet. That gap is what these tests are about.
 */
const MID_WINDOW = new Date('2099-01-05')
const AFTER_WINDOW = new Date('2100-01-01')

/** Two real fixtures covering all four synthetic teams. */
function period1(aScore: number | null, bScore: number | null, cScore: number, dScore: number) {
  const fixtures: Fixture[] = [
    { period: 1, awayTeamId: 'A', homeTeamId: 'B', awayScore: aScore, homeScore: bScore },
    { period: 1, awayTeamId: 'C', homeTeamId: 'D', awayScore: cScore, homeScore: dScore },
  ]
  return fixtures
}

describe('auditRegularPeriods with published results', () => {
  it('settles a gameweek whose results are published but whose window is still open', () => {
    // The bug this fixes: Fantrax published real GW1 scores days before its
    // period window closed, and the site showed nothing at all.
    const season = syntheticSeason({
      fixtures: period1(59.75, 68.5, 94, 129.75),
      periodsWithResults: [1],
    })
    const audit = auditRegularPeriods(season, MID_WINDOW)
    expect(audit.settled).toEqual([1])
    expect(audit.withheld).toEqual([])
  })

  it('marks such a gameweek provisional, since the window can still bring corrections', () => {
    const season = syntheticSeason({
      fixtures: period1(59.75, 68.5, 94, 129.75),
      periodsWithResults: [1],
    })
    expect(auditRegularPeriods(season, MID_WINDOW).provisional).toEqual([1])
  })

  it('stops calling it provisional once the window has closed', () => {
    const season = syntheticSeason({
      fixtures: period1(59.75, 68.5, 94, 129.75),
      periodsWithResults: [1],
    })
    const audit = auditRegularPeriods(season, AFTER_WINDOW)
    expect(audit.settled).toEqual([1])
    expect(audit.provisional).toEqual([])
  })

  it('ignores a gameweek with no published results and an open window', () => {
    // Not played yet: absent from the ledger entirely, not "withheld".
    const season = syntheticSeason({
      fixtures: period1(0, 0, 0, 0),
      periodsWithResults: [],
    })
    const audit = auditRegularPeriods(season, MID_WINDOW)
    expect(audit.settled).toEqual([])
    expect(audit.withheld).toEqual([])
    expect(audit.provisional).toEqual([])
  })

  it('still settles on the closed window alone when no results flag is available', () => {
    // Backwards compatibility: if Fantrax ever stops sending the table type,
    // behaviour falls back to exactly the old date-based rule rather than
    // hiding the whole season.
    const season = syntheticSeason({
      fixtures: period1(59.75, 68.5, 94, 129.75),
      periodsWithResults: [],
    })
    expect(auditRegularPeriods(season, AFTER_WINDOW).settled).toEqual([1])
  })

  it('withholds a published gameweek whose scores are all zero', () => {
    // Fantrax posts an unplayed gameweek as "0", so a results flag alone
    // must never be enough to pay out.
    const season = syntheticSeason({
      fixtures: period1(0, 0, 0, 0),
      periodsWithResults: [1],
    })
    const audit = auditRegularPeriods(season, MID_WINDOW)
    expect(audit.settled).toEqual([])
    expect(audit.withheld).toEqual([1])
  })

  it('withholds a published gameweek missing a score', () => {
    const season = syntheticSeason({
      fixtures: period1(59.75, null, 94, 129.75),
      periodsWithResults: [1],
    })
    const audit = auditRegularPeriods(season, MID_WINDOW)
    expect(audit.settled).toEqual([])
    expect(audit.withheld).toEqual([1])
  })

  it('settles only the periods whose results are published', () => {
    const season = syntheticSeason({
      fixtures: [
        ...period1(59.75, 68.5, 94, 129.75),
        { period: 2, awayTeamId: 'A', homeTeamId: 'B', awayScore: 0, homeScore: 0 },
        { period: 2, awayTeamId: 'C', homeTeamId: 'D', awayScore: 0, homeScore: 0 },
      ],
      regularSeasonPeriods: 2,
      periodsWithResults: [1],
    })
    const audit = auditRegularPeriods(season, MID_WINDOW)
    expect(audit.settled).toEqual([1])
    expect(audit.withheld).toEqual([])
  })
})
