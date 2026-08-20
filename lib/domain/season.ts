import type { SeasonData, TeamId } from './types'

/**
 * Every team's score in a gameweek, taken from real fixtures where each
 * team appears exactly once. Teams whose score has not been reported yet
 * are omitted rather than recorded as zero.
 */
export function scoresForPeriod(season: SeasonData, period: number): Map<TeamId, number> {
  const scores = new Map<TeamId, number>()
  for (const f of season.fixtures) {
    if (f.period !== period) continue
    if (f.homeScore !== null) scores.set(f.homeTeamId, f.homeScore)
    if (f.awayScore !== null) scores.set(f.awayTeamId, f.awayScore)
  }
  return scores
}

export function isPeriodComplete(
  season: SeasonData,
  period: number,
  now: Date,
): boolean {
  const p = season.periods.find((x) => x.number === period)
  if (!p) return false
  const end = new Date(p.endDate)
  if (Number.isNaN(end.getTime())) return false
  return end.getTime() < now.getTime()
}

/** Completed gameweeks within the regular season, ascending. */
export function completedRegularPeriods(season: SeasonData, now: Date): number[] {
  const out: number[] = []
  for (let p = 1; p <= season.regularSeasonPeriods; p++) {
    if (isPeriodComplete(season, p, now)) out.push(p)
  }
  return out
}
