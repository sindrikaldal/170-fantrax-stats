import { LEAGUES, PRIZE_RULE_FROM_SEASON } from '@/config/leagues'
import { fetchLeagueInfo, fetchSchedule } from '@/lib/fantrax/client'
import { buildSeasonData } from '@/lib/adapt/season'
import type { SeasonData } from '@/lib/domain/types'

/**
 * Whether the gameweek prize was a real league rule in this season.
 * When false, the ledger is hypothetical and must be labelled as such.
 */
export function prizeRuleApplies(year: number): boolean {
  return year >= PRIZE_RULE_FROM_SEASON
}

export async function loadSeason(year: number): Promise<SeasonData> {
  const leagueId = LEAGUES[year]
  if (!leagueId) throw new Error(`No league configured for season ${year}`)

  const [info, schedule] = await Promise.all([
    fetchLeagueInfo(leagueId),
    fetchSchedule(leagueId),
  ])
  return buildSeasonData(info, schedule, leagueId)
}
