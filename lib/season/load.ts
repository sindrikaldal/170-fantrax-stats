import { LEAGUES, PRIZE_RULE_FROM_SEASON } from '@/config/leagues'
import { fetchLeagueInfo, fetchPeriodMatches, fetchSchedule } from '@/lib/fantrax/client'
import { buildSeasonData } from '@/lib/adapt/season'
import { adaptPeriodMatches } from '@/lib/adapt/periodMatches'
import { isPeriodComplete } from '@/lib/domain/season'
import type { PeriodMatches, SeasonData } from '@/lib/domain/types'

/**
 * Whether the gameweek prize was a real league rule in this season.
 * When false, the ledger is hypothetical and must be labelled as such.
 */
export function prizeRuleApplies(year: number): boolean {
  return year >= PRIZE_RULE_FROM_SEASON
}

/**
 * One season's data. `now` decides which gameweeks need the extra match
 * report: those with published scores whose window has not closed yet,
 * normally none or one. A report that cannot be fetched or read is logged
 * and dropped, leaving that gameweek on the window rule — in progress until
 * the next gameweek kicks off, which is slow but never wrong.
 */
export async function loadSeason(year: number, now: Date = new Date()): Promise<SeasonData> {
  const leagueId = LEAGUES[year]
  if (!leagueId) throw new Error(`No league configured for season ${year}`)

  const [info, schedule] = await Promise.all([
    fetchLeagueInfo(leagueId),
    fetchSchedule(leagueId),
  ])
  const season = buildSeasonData(info, schedule, leagueId)

  const sampleTeam = season.teams[0]?.teamId
  const inWindow = season.periodsWithResults.filter(
    (p) => p <= season.regularSeasonPeriods && !isPeriodComplete(season, p, now),
  )
  if (!sampleTeam || inWindow.length === 0) return season

  const periodMatches: Record<number, PeriodMatches> = {}
  await Promise.all(
    inWindow.map(async (period) => {
      const start = season.periods.find((p) => p.number === period)?.startDate
      if (!start) return
      try {
        const raw = await fetchPeriodMatches(leagueId, sampleTeam, period)
        periodMatches[period] = adaptPeriodMatches(raw, period, start)
      } catch (err) {
        console.error(`Season ${year} GW${period}: match report unavailable, using window:`, err)
      }
    }),
  )
  return { ...season, periodMatches }
}
