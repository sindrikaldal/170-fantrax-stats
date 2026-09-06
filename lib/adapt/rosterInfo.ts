import type { RawRosterInfoResponse } from '@/lib/fantrax/schemas'
import type { LineupPlayer, Position } from '@/lib/domain/types'
import { parseScore } from './schedule'

/** Fantrax position ids for EPL. Anything else is a shape change. */
const POSITION_BY_ID: Record<string, Position> = {
  '704': 'G',
  '703': 'D',
  '702': 'M',
  '701': 'F',
}

const STATUS_ACTIVE = '1'
const STATUS_RESERVE = '2'

/** The timeframe under which per-player figures are for one gameweek only. */
const BY_PERIOD = 'BY_PERIOD'

export class RosterInfoShapeError extends Error {
  constructor(message: string) {
    super(`getTeamRosterInfo: ${message}`)
    this.name = 'RosterInfoShapeError'
  }
}

/**
 * One team's players for one gameweek, with that gameweek's points.
 *
 * Fails loudly rather than guessing: a response for the wrong period or the
 * season-to-date timeframe would silently produce nonsense regret figures,
 * and an unknown status or position id means Fantrax changed something.
 */
export function adaptRosterInfo(
  raw: RawRosterInfoResponse,
  expectedPeriod: number,
  expectedTeamId?: string,
): LineupPlayer[] {
  const data = raw.responses[0].data
  const sel = data.displayedSelections
  // Fantrax answers an unrecognised team parameter with the commissioner's
  // team instead of an error, so the echoed team id is checked when present.
  if (
    expectedTeamId !== undefined &&
    sel.displayedFantasyTeamId !== undefined &&
    sel.displayedFantasyTeamId !== expectedTeamId
  ) {
    throw new RosterInfoShapeError(
      `asked for team ${expectedTeamId}, got ${sel.displayedFantasyTeamId}`,
    )
  }
  if (sel.displayedSeasonOrProjection.timeframeTypeCode !== BY_PERIOD) {
    throw new RosterInfoShapeError(
      `expected ${BY_PERIOD} figures, got ${sel.displayedSeasonOrProjection.timeframeTypeCode}`,
    )
  }
  if (sel.displayedPeriod !== expectedPeriod) {
    throw new RosterInfoShapeError(`asked for period ${expectedPeriod}, got ${sel.displayedPeriod}`)
  }

  const players: LineupPlayer[] = []
  const seen = new Set<string>()
  for (const table of data.tables) {
    const fptsIndex = table.header.cells.findIndex(
      (c) => c.key === 'fpts' || c.name === 'Fantasy Points',
    )
    if (fptsIndex === -1) throw new RosterInfoShapeError('no Fantasy Points column')

    for (const row of table.rows) {
      // Empty slots have no scorer; the totals row has one without an id.
      const scorerId = row.scorer?.scorerId
      if (!scorerId) continue
      const name = row.scorer?.name ?? scorerId

      let starter: boolean
      if (row.statusId === STATUS_ACTIVE) starter = true
      else if (row.statusId === STATUS_RESERVE) starter = false
      else throw new RosterInfoShapeError(`unknown statusId ${row.statusId} for ${name}`)

      const posIds = row.eligiblePosIds ?? (row.posId ? [row.posId] : [])
      if (posIds.length === 0) throw new RosterInfoShapeError(`no position for ${name}`)
      const positions = posIds.map((id) => {
        const pos = POSITION_BY_ID[id]
        if (!pos) throw new RosterInfoShapeError(`unknown position id ${id} for ${name}`)
        return pos
      })

      const cell = row.cells[fptsIndex]
      const content = typeof cell === 'string' ? cell : cell?.content
      const points = content === undefined ? null : parseScore(content)
      if (points === null) throw new RosterInfoShapeError(`unreadable points for ${name}`)

      if (seen.has(scorerId)) throw new RosterInfoShapeError(`${name} listed twice`)
      seen.add(scorerId)
      players.push({ playerId: scorerId, name, positions, starter, points })
    }
  }
  return players
}
