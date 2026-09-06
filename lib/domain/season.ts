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

/** Whether a gameweek's window has opened as of `now`. */
export function isPeriodStarted(season: SeasonData, period: number, now: Date): boolean {
  const p = season.periods.find((x) => x.number === period)
  if (!p) return false
  const start = new Date(p.startDate)
  if (Number.isNaN(start.getTime())) return false
  return start.getTime() <= now.getTime()
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
   * Periods believed played but whose scores failed a completeness guard —
   * awaiting final scores, truncated, or posted as placeholder zeros.
   * Distinct from "not yet played".
   */
  withheld: number[]
  /**
   * Settled periods whose Fantrax window has not closed yet. A subset of
   * `settled`. Fantrax publishes results as soon as scoring starts (verified
   * 2026-09-06, with a match still to play), so these are gameweeks *in
   * progress*: their scores are real but incomplete. Nothing that concerns
   * money may count them; they are shown as "leading", never "won".
   */
  provisional: number[]
}

/**
 * Whether a gameweek is far enough along to judge its scores at all.
 *
 * Published results are the primary signal: a gameweek's matches finish
 * days before Fantrax closes the period window, and waiting for the window
 * hid finished gameweeks for most of a week. The window remains a fallback,
 * so that losing the upstream signal degrades to the old behaviour rather
 * than emptying the whole site.
 */
function isPeriodJudgeable(season: SeasonData, period: number, now: Date): boolean {
  if (isPeriodComplete(season, period, now)) return true
  // `periodsWithResults` describes the fetch, not `now`, so it must never
  // vouch for a gameweek that has not started as of `now` — otherwise
  // fetching a finished season would report every gameweek as played at any
  // date, including before the season began.
  return isPeriodStarted(season, period, now) && season.periodsWithResults.includes(period)
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
  const provisional: number[] = []
  const expectedFixtures = maxFixturesPerPeriod(season)

  for (let period = 1; period <= season.regularSeasonPeriods; period++) {
    if (!isPeriodJudgeable(season, period, now)) continue

    const fixtureCount = season.fixtures.filter((f) => f.period === period).length
    const scores = scoresForPeriod(season, period)
    const trusted =
      fixtureCount > 0 &&
      fixtureCount === expectedFixtures &&
      scores.size === 2 * fixtureCount &&
      Math.max(...scores.values()) > 0

    if (!trusted) {
      withheld.push(period)
      continue
    }

    settled.push(period)
    if (!isPeriodComplete(season, period, now)) provisional.push(period)
  }
  return { settled, withheld, provisional }
}
