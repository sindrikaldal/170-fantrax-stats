import type { SeasonData } from '@/lib/domain/types'

/** Icelandic-locale integer formatting for ISK amounts, shared by ledger displays. */
export const isk = new Intl.NumberFormat('is-IS', { maximumFractionDigits: 0 })

/** Resolves a team's display name, falling back to the raw id if unknown. */
export function teamName(season: SeasonData, teamId: string): string {
  return season.teams.find((t) => t.teamId === teamId)?.name ?? teamId
}
