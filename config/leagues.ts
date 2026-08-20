/**
 * Fantrax issues a new leagueId per season. leagueHistoryId 6yst2cj3l5tiizya
 * is stable across all seasons of "170 Broskis".
 */
export const LEAGUE_HISTORY_ID = '6yst2cj3l5tiizya'

export const LEAGUES: Record<number, string> = {
  2026: 'ywhebyp7msyix1sj',
  2025: '7he4pkgpme8uz58b',
}

/** Newest first, for UI ordering. */
export const SEASON_YEARS: number[] = Object.keys(LEAGUES)
  .map(Number)
  .sort((a, b) => b - a)

export const CURRENT_SEASON = SEASON_YEARS[0]

/**
 * The 1500 ISK gameweek prize is new for the 2026 season. Earlier seasons
 * are computed for display only and must be labelled hypothetical.
 */
export const PRIZE_RULE_FROM_SEASON = 2026
