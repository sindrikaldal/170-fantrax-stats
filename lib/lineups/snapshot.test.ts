import { describe, it, expect } from 'vitest'
import { verifyLineupSnapshot } from '@/lib/lineups/snapshot'
import type { Fixture, LineupSnapshot } from '@/lib/domain/types'
import { syntheticSeason } from '@/test/helpers/synthetic'

const fixtures: Fixture[] = [
  { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 20, awayScore: 25 },
]
const season = syntheticSeason({ fixtures, periodsWithResults: [1] })
const p = (id: string, starter: boolean, points: number) => ({
  playerId: id,
  name: id,
  positions: ['M' as const],
  starter,
  points,
})

describe('verifyLineupSnapshot', () => {
  const good: LineupSnapshot = {
    seasonYear: season.seasonYear,
    period: 1,
    final: true,
    capturedAt: 'now',
    teams: [
      { teamId: 'A', players: [p('a1', true, 12), p('a2', true, 8), p('a3', false, 40)] },
      { teamId: 'B', players: [p('b1', true, 25)] },
    ],
  }

  it('accepts a snapshot whose starters sum to the recorded scores', () => {
    expect(verifyLineupSnapshot(good, season)).toEqual([])
  })

  it('rejects a starter sum that disagrees with the schedule', () => {
    const bad = { ...good, teams: [{ teamId: 'A', players: [p('a1', true, 12)] }, good.teams[1]] }
    expect(verifyLineupSnapshot(bad, season)).toEqual([
      'GW1: team A starters sum to 12, schedule says 20',
    ])
  })

  it('rejects a missing team and an unknown team', () => {
    const bad = { ...good, teams: [good.teams[0], { teamId: 'Z', players: [] }] }
    const problems = verifyLineupSnapshot(bad, season)
    expect(problems).toContain('GW1: no lineup for team B')
    expect(problems).toContain('GW1: lineup for unknown team Z')
  })
})
