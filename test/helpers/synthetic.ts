import type { AverageFixture, Fixture, Period, SeasonData, Team } from '@/lib/domain/types'

const DEFAULT_TEAMS: Team[] = [
  { teamId: 'A', name: 'Team A', shortName: null, logoUrl: null },
  { teamId: 'B', name: 'Team B', shortName: null, logoUrl: null },
  { teamId: 'C', name: 'Team C', shortName: null, logoUrl: null },
  { teamId: 'D', name: 'Team D', shortName: null, logoUrl: null },
]

export interface SyntheticSeasonOptions {
  seasonYear?: number
  teams?: Team[]
  periods?: Period[]
  fixtures?: Fixture[]
  averageFixtures?: AverageFixture[]
  regularSeasonPeriods?: number
}

/** All synthetic periods are complete by this date. */
export const SYNTHETIC_SEASON_OVER = new Date('2100-01-01')

/**
 * A minimal SeasonData for states the real 2025 fixture never produced.
 * Periods default to one week per period starting 2099-01-01, so every
 * period is in the past relative to SYNTHETIC_SEASON_OVER and in the
 * future relative to any real "now".
 */
export function syntheticSeason(opts: SyntheticSeasonOptions = {}): SeasonData {
  const fixtures = opts.fixtures ?? []
  const maxPeriod = Math.max(1, ...fixtures.map((f) => f.period))
  const regularSeasonPeriods = opts.regularSeasonPeriods ?? maxPeriod
  const periods =
    opts.periods ??
    Array.from({ length: maxPeriod }, (_, i) => ({
      number: i + 1,
      startDate: new Date(Date.UTC(2099, 0, 1 + i * 7)).toISOString(),
      endDate: new Date(Date.UTC(2099, 0, 8 + i * 7)).toISOString(),
    }))

  return {
    seasonYear: opts.seasonYear ?? 2099,
    leagueId: 'synthetic',
    leagueName: 'Synthetic League',
    regularSeasonPeriods,
    totalPeriods: periods.length,
    teams: opts.teams ?? DEFAULT_TEAMS,
    periods,
    fixtures,
    averageFixtures: opts.averageFixtures ?? [],
  }
}
