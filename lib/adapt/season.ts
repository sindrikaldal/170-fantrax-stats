import type { RawLeagueInfo, RawScheduleResponse } from '@/lib/fantrax/schemas'
import type { SeasonData } from '@/lib/domain/types'
import { adaptLeagueInfo } from './leagueInfo'
import { adaptSchedule } from './schedule'

export function buildSeasonData(
  rawInfo: RawLeagueInfo,
  rawSchedule: RawScheduleResponse,
  leagueId: string,
): SeasonData {
  const info = adaptLeagueInfo(rawInfo)
  const schedule = adaptSchedule(rawSchedule)

  const teams = info.teams.map((t) => {
    const meta = schedule.teamMeta.get(t.teamId)
    return { ...t, shortName: meta?.shortName ?? null, logoUrl: meta?.logoUrl ?? null }
  })

  return {
    seasonYear: info.seasonYear,
    leagueId,
    leagueName: info.leagueName,
    regularSeasonPeriods: info.regularSeasonPeriods,
    totalPeriods: info.totalPeriods,
    playoffTeams: info.playoffTeams,
    teams,
    periods: info.periods,
    fixtures: schedule.fixtures,
    averageFixtures: schedule.averageFixtures,
  }
}
