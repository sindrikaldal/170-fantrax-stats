import type { SeasonData } from '@/lib/domain/types'

/** Icelandic-locale integer formatting for ISK amounts, shared by ledger displays. */
export const isk = new Intl.NumberFormat('is-IS', { maximumFractionDigits: 0 })

/**
 * One rounding rule for every displayed fantasy score/margin, used
 * everywhere such a value renders (award cards, the league table's
 * points-for, gameweek history). Real scores are quarter-point increments
 * (x.25/x.5/x.75), but arithmetic on them (e.g. winnerScore - loserScore, or
 * summing many fixtures) produces float artifacts like 77.80000000000001.
 * Rounding to 2 decimals removes that noise without destroying legitimate
 * quarter-point precision, and trimming trailing zeros keeps whole numbers
 * clean ("123", not "123.00").
 */
export function formatScore(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return rounded.toFixed(2).replace(/\.?0+$/, '')
}

/** Resolves a team's display name, falling back to the raw id if unknown. */
export function teamName(season: SeasonData, teamId: string): string {
  return season.teams.find((t) => t.teamId === teamId)?.name ?? teamId
}
