import type { RawRosterInfoResponse } from '@/lib/fantrax/schemas'
import type { PeriodMatches } from '@/lib/domain/types'

/** The roster view whose header lists the gameweek's real-sport match days. */
const SCHEDULE_PERIOD = 'SCHEDULE_PERIOD'

/** `"Sun 9/20"` — weekday, month, day. No year anywhere in the response. */
const MATCH_DAY = /^[A-Za-z]{3} (\d{1,2})\/(\d{1,2})$/

/** `"CRY 0<br/>@LEE 0 F"`: Fantrax marks a finished match with a trailing F. */
const FINAL = /\sF$/

export class PeriodMatchesShapeError extends Error {
  constructor(message: string) {
    super(`getTeamRosterInfo/${SCHEDULE_PERIOD}: ${message}`)
    this.name = 'PeriodMatchesShapeError'
  }
}

/**
 * When a gameweek's real-sport matches are played, and whether the ones this
 * roster can see have finished.
 *
 * `periodStart` is the gameweek's Fantrax window start, used only to attach a
 * year to `"Sun 9/20"`: a match day whose month precedes the window's month
 * belongs to the following year (a gameweek opening in late December and
 * playing in early January).
 *
 * Fails loudly on anything unexpected — a different view, period or a header
 * without match days — because the caller treats a missing report as "fall
 * back to the window", which is safe, whereas a misread date could pay a
 * prize while a match is still being played.
 */
export function adaptPeriodMatches(
  raw: RawRosterInfoResponse,
  expectedPeriod: number,
  periodStart: string,
): PeriodMatches {
  const data = raw.responses[0].data
  const sel = data.displayedSelections
  if (sel.displayedView !== undefined && sel.displayedView !== SCHEDULE_PERIOD) {
    throw new PeriodMatchesShapeError(`expected view ${SCHEDULE_PERIOD}, got ${sel.displayedView}`)
  }
  if (sel.displayedPeriod !== expectedPeriod) {
    throw new PeriodMatchesShapeError(`asked for period ${expectedPeriod}, got ${sel.displayedPeriod}`)
  }
  const start = new Date(periodStart)
  if (Number.isNaN(start.getTime())) {
    throw new PeriodMatchesShapeError(`unreadable period start ${periodStart}`)
  }
  // The window boundary is expressed in US Eastern, like the match days.
  const startYear = start.getUTCFullYear()
  const startMonth = start.getUTCMonth() + 1

  const matchDates: string[] = []
  const eventsFinal = new Map<string, boolean>()
  for (const table of data.tables) {
    for (const cell of table.header.cells) {
      if (!cell.eventStr) continue
      const m = cell.shortName?.match(MATCH_DAY)
      if (!m) throw new PeriodMatchesShapeError(`unreadable match day ${JSON.stringify(cell.shortName)}`)
      const month = Number(m[1])
      const day = Number(m[2])
      const year = month < startMonth ? startYear + 1 : startYear
      matchDates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    }
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (typeof cell === 'string' || !cell.eventId) continue
        const final = FINAL.test(cell.content)
        // One match appears once per player involved; any non-final sighting wins.
        eventsFinal.set(cell.eventId, (eventsFinal.get(cell.eventId) ?? true) && final)
      }
    }
  }
  if (matchDates.length === 0) throw new PeriodMatchesShapeError('no match days in header')

  matchDates.sort()
  return {
    lastMatchDate: matchDates[matchDates.length - 1],
    unfinished: [...eventsFinal.values()].filter((final) => !final).length,
  }
}
