import type { RawLeagueInfo } from '@/lib/fantrax/schemas'
import type { Period, Team } from '@/lib/domain/types'

export interface AdaptedLeagueInfo {
  leagueName: string
  seasonYear: number
  teams: Team[]
  periods: Period[]
  regularSeasonPeriods: number
  totalPeriods: number
  playoffTeams: number
}

export function adaptLeagueInfo(raw: RawLeagueInfo): AdaptedLeagueInfo {
  const teams: Team[] = Object.values(raw.teamInfo)
    .map((t) => ({
      teamId: t.id,
      name: t.name,
      shortName: null,
      logoUrl: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const periods: Period[] = [...raw.scoringPeriods]
    .sort((a, b) => a.number - b.number)
    .map((p) => ({ number: p.number, startDate: p.startDate, endDate: p.endDate }))

  return {
    leagueName: raw.leagueName,
    seasonYear: raw.seasonYear,
    teams,
    periods,
    regularSeasonPeriods: raw.playoffs.lastRegularSeasonPeriod,
    totalPeriods: periods.length,
    playoffTeams: raw.playoffs.numPlayoffTeams,
  }
}
