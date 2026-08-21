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

/**
 * The largest number of real fixtures any regular-season period carries.
 * Within one schedule response this is the expected fixture count for
 * every period; a period below it had rows truncated during parsing.
 */
export function maxFixturesPerPeriod(season: SeasonData): number {
  const counts = new Map<number, number>()
  for (const f of season.fixtures) {
    if (f.period > season.regularSeasonPeriods) continue
    counts.set(f.period, (counts.get(f.period) ?? 0) + 1)
  }
  return counts.size === 0 ? 0 : Math.max(...counts.values())
}

export interface PeriodAudit {
  /** Regular-season periods whose scores can be trusted completely. */
  settled: number[]
  /**
   * Periods whose end date has passed but whose scores failed a
   * completeness guard — awaiting final scores, truncated, or posted as
   * placeholder zeros. Distinct from "not yet played".
   */
  withheld: number[]
}

/**
 * The single trust decision for a gameweek's scores. Guards, in order:
 *
 * 1. The period's fixture count must equal the maximum observed across
 *    this same schedule response. Catches a period whose rows were
 *    truncated during parsing even when the surviving rows have complete
 *    scores. Self-consistent within one fetch, so immune to the
 *    cross-fetch cache skew that ruled out comparing to `teams.length`.
 * 2. Every team in the period must have reported a score. Fantrax posts
 *    an unplayed gameweek's score as the string "0", not blank, so a
 *    date-based check alone is not sufficient.
 * 3. The top score must be positive. An all-zero period is a Fantrax
 *    placeholder for an unplayed gameweek, never a real result.
 *
 * Guards 2 and 3 overlap but are NOT redundant — see AGENTS.md.
 */
export function auditRegularPeriods(season: SeasonData, now: Date): PeriodAudit {
  const settled: number[] = []
  const withheld: number[] = []
  const expectedFixtures = maxFixturesPerPeriod(season)

  for (const period of completedRegularPeriods(season, now)) {
    const fixtureCount = season.fixtures.filter((f) => f.period === period).length
    const scores = scoresForPeriod(season, period)
    const trusted =
      fixtureCount > 0 &&
      fixtureCount === expectedFixtures &&
      scores.size === 2 * fixtureCount &&
      Math.max(...scores.values()) > 0
    if (trusted) settled.push(period)
    else withheld.push(period)
  }
  return { settled, withheld }
}
