import type { SeasonData } from '@/lib/domain/types'
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
