export type TeamId = string
export type ManagerId = string

export interface Team {
  teamId: TeamId
  name: string
  shortName: string | null
  logoUrl: string | null
}

export interface Period {
  number: number
  /** ISO 8601, from Fantrax scoringPeriods */
  startDate: string
  endDate: string
}

/** A real head-to-head fixture. Scores are null until the gameweek is complete. */
export interface Fixture {
  period: number
  homeTeamId: TeamId
  awayTeamId: TeamId
  homeScore: number | null
  awayScore: number | null
}

/**
 * A team's second fixture of the gameweek, against the league mean.
 * Every team has exactly one of these per period.
 */
export interface AverageFixture {
  period: number
  teamId: TeamId
  teamScore: number | null
  averageScore: number | null
}

export interface SeasonData {
  seasonYear: number
  leagueId: string
  leagueName: string
  /** Last gameweek of the regular season, 35 in both known seasons. */
  regularSeasonPeriods: number
  totalPeriods: number
  teams: Team[]
  periods: Period[]
  /** Real matchups only. Never contains *League Average* rows. */
  fixtures: Fixture[]
  averageFixtures: AverageFixture[]
}
