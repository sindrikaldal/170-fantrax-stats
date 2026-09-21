import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { RosterInfoResponseSchema, type RawRosterInfoResponse } from '@/lib/fantrax/schemas'
import { adaptPeriodMatches, PeriodMatchesShapeError } from './periodMatches'

function fixture(name: string): RawRosterInfoResponse {
  return RosterInfoResponseSchema.parse(
    JSON.parse(readFileSync(`test/fixtures/2026/${name}.json`, 'utf8')),
  )
}

// Both captured 2026-09-21, the Monday after GW5's matches (Fri 18 – Sun 20)
// and inside its three-week window, which runs to Oct 9 because of the
// international break. GW6 had not kicked off.
const played = fixture('fxpa-getTeamRosterInfo-p5-schedulePeriod')
const upcoming = fixture('fxpa-getTeamRosterInfo-p6-schedulePeriod')

const GW5_START = '2026-09-18T15:00:00.0-0400'
const GW6_START = '2026-10-09T06:00:00.0-0400'

/** A minimal response in the same shape, for states the captures lack. */
function synthetic(
  period: number,
  matchDays: string[],
  events: Array<[id: string, content: string]>,
): RawRosterInfoResponse {
  return RosterInfoResponseSchema.parse({
    responses: [
      {
        data: {
          displayedSelections: {
            displayedPeriod: period,
            displayedView: 'SCHEDULE_PERIOD',
            displayedSeasonOrProjection: { timeframeTypeCode: 'BY_PERIOD' },
          },
          tables: [
            {
              header: {
                cells: [
                  { name: 'Fantasy Points', key: 'fpts' },
                  ...matchDays.map((d) => ({ shortName: d, eventStr: true })),
                ],
              },
              rows: events.map(([eventId, content]) => ({
                statusId: '1',
                cells: [{ content: '0' }, { content, eventId }],
              })),
            },
          ],
        },
      },
    ],
  })
}

describe('adaptPeriodMatches', () => {
  it('reads the last match day of a played gameweek from the header, not the window', () => {
    // Window Sept 18 – Oct 8; matches Fri 18, Sat 19, Sun 20.
    const report = adaptPeriodMatches(played, 5, GW5_START)
    expect(report.lastMatchDate).toBe('2026-09-20')
  })

  it('sees every match of a played gameweek as final', () => {
    expect(adaptPeriodMatches(played, 5, GW5_START).unfinished).toBe(0)
  })

  it('sees every match of an upcoming gameweek as unfinished', () => {
    const report = adaptPeriodMatches(upcoming, 6, GW6_START)
    expect(report.lastMatchDate).toBe('2026-10-12')
    // Eight distinct matches on this sixteen-player roster; each shows a
    // kickoff time, none an F.
    expect(report.unfinished).toBe(8)
  })

  it('counts a match once however many rostered players are in it', () => {
    const raw = synthetic(1, ['Sat 9/19'], [
      ['e1', 'ARS 0<br/>@BHA 3 F'],
      ['e1', 'ARS 0<br/>@BHA 3 F'],
      ['e2', '@LIV<br/>Sun 11:30AM'],
      ['e2', 'MCI<br/>Sun 11:30AM'],
    ])
    expect(adaptPeriodMatches(raw, 1, GW5_START).unfinished).toBe(1)
  })

  it('treats anything but a final as unfinished, including a live score', () => {
    // Not captured live; the format is assumed to be the result without F.
    const raw = synthetic(1, ['Sat 9/19'], [['e1', 'CRY 0<br/>@LEE 0']])
    expect(adaptPeriodMatches(raw, 1, GW5_START).unfinished).toBe(1)
  })

  it('attaches the following year to a match day that precedes the window month', () => {
    const raw = synthetic(20, ['Wed 12/30', 'Sat 1/2', 'Sun 1/3'], [])
    expect(adaptPeriodMatches(raw, 20, '2026-12-29T15:00:00.0-0500').lastMatchDate).toBe(
      '2027-01-03',
    )
  })

  it('rejects a response for a different period', () => {
    expect(() => adaptPeriodMatches(played, 6, GW6_START)).toThrow(PeriodMatchesShapeError)
  })

  it('rejects a response in a different view', () => {
    const raw = RosterInfoResponseSchema.parse(
      JSON.parse(readFileSync('test/fixtures/2025/fxpa-getTeamRosterInfo-p1-byPeriod.json', 'utf8')),
    )
    expect(() => adaptPeriodMatches(raw, 1, '2025-08-15T15:00:00.0-0400')).toThrow(
      PeriodMatchesShapeError,
    )
  })

  it('rejects a header with no match days rather than guessing', () => {
    expect(() => adaptPeriodMatches(synthetic(1, [], []), 1, GW5_START)).toThrow(
      PeriodMatchesShapeError,
    )
  })
})
