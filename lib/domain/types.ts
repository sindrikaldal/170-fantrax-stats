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
  /** Teams that make the playoffs: 5 of 10 in 2025, 7 of 14 in 2026. */
  playoffTeams: number
  teams: Team[]
  periods: Period[]
  /** Real matchups only. Never contains *League Average* rows. */
  fixtures: Fixture[]
  averageFixtures: AverageFixture[]
  /**
   * Regular-season periods Fantrax has published results for, ascending.
   *
   * A gameweek's matches finish days before Fantrax closes its period
   * window, so this is what makes a scored gameweek visible immediately
   * rather than waiting for the window. Empty when the upstream signal is
   * unavailable, in which case completeness falls back to the window.
   */
  periodsWithResults: number[]
}

/** ---------- Lineups (per-player, per-gameweek) ---------- */

export type PlayerId = string
export type Position = 'G' | 'D' | 'M' | 'F'

/**
 * How many of each position may be active at once. Every known season
 * uses 11 starters with at most 1 G, 5 D, 5 M and 3 F; there are no
 * minimums, and an active slot may be left empty.
 */
export interface LineupRules {
  maxActive: number
  maxPerPosition: Record<Position, number>
}

export interface LineupPlayer {
  playerId: PlayerId
  name: string
  /** Positions this player may fill. Almost always exactly one. */
  positions: Position[]
  /** True if the manager fielded the player that gameweek. */
  starter: boolean
  /** Fantasy points scored in that gameweek alone, bench included. */
  points: number
}

/** One team's roster for one gameweek, as it was when the matches were played. */
export interface TeamLineup {
  teamId: TeamId
  players: LineupPlayer[]
}

/**
 * Every team's lineup for one gameweek. Captured from Fantrax by the
 * snapshot script and committed to the repo; never fetched at request time.
 */
export interface LineupSnapshot {
  seasonYear: number
  period: number
  /**
   * False when captured while the Fantrax window was still open, so stat
   * corrections could still move points. Such a snapshot is re-captured
   * until the window closes.
   */
  final: boolean
  /** ISO 8601 */
  capturedAt: string
  teams: TeamLineup[]
}
