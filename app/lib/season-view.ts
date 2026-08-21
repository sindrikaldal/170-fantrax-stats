import type { SeasonData } from '@/lib/domain/types'
import { SEASON_YEARS } from '@/config/leagues'
import { loadSeason, prizeRuleApplies } from '@/lib/season/load'
import { auditRegularPeriods } from '@/lib/domain/season'

/**
 * Everything a page component needs about one season, pre-assembled so
 * pages never call loadSeason/auditRegularPeriods/prizeRuleApplies
 * directly. Keeps the "how many gameweeks can we trust" question answered
 * in exactly one place.
 */
export interface SeasonView {
  year: number
  season: SeasonData
  /** Regular-season periods whose scores are settled and safe to display. */
  settled: number[]
  /** True when the gameweek prize did not exist yet in this season. */
  hypothetical: boolean
}

export async function loadSeasonView(year: number, now: Date): Promise<SeasonView> {
  const season = await loadSeason(year)
  const { settled } = auditRegularPeriods(season, now)
  return {
    year,
    season,
    settled,
    hypothetical: !prizeRuleApplies(year),
  }
}

/**
 * Every season we can load, for the sections that span them. Rivalries are
 * cross-season by nature — a nemesis earned in 2025 is still a nemesis on
 * the 2026 page — so those components need all seasons regardless of which
 * season page they are rendered on.
 *
 * `allSettled`, not `all`: one season failing to load must degrade the
 * rivalry history rather than take down the page, matching how the front
 * page already treats a failed season. A rejected year is logged and
 * dropped, so callers always get real data or less of it, never a throw.
 */
export async function loadAllSeasonViews(now: Date): Promise<SeasonView[]> {
  const results = await Promise.allSettled(
    SEASON_YEARS.map((year) => loadSeasonView(year, now)),
  )
  const views: SeasonView[] = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') views.push(result.value)
    else console.error(`Failed to load season ${SEASON_YEARS[i]}:`, result.reason)
  })
  return views.sort((a, b) => a.year - b.year)
}
