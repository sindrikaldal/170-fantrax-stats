import type { ManagerId, SeasonData } from '@/lib/domain/types'
import type { ManagerResolution } from '@/lib/stats/managers'

/**
 * Everything the rivalry components need to *draw* a manager, resolved
 * once instead of in every component: display name, short name, crest,
 * and which seasons they appear in.
 *
 * This is presentation lookup, not a statistic — it turns a `ManagerId`
 * into pixels. Anything that computes a number belongs in `lib/stats/`.
 */
export interface ManagerCard {
  managerId: ManagerId
  name: string
  shortName: string
  logoUrl: string | null
  /** Ascending. A single entry means one season only — possibly a rename. */
  seasonYears: number[]
}

export function managerIndex(
  resolution: ManagerResolution,
  seasons: SeasonData[],
): Map<ManagerId, ManagerCard> {
  const teamByKey = new Map(
    seasons.flatMap((s) => s.teams.map((t) => [`${s.seasonYear}:${t.teamId}`, t] as const)),
  )

  return new Map(
    resolution.managers.map((m) => {
      // The manager's most recent team carries the current crest and name:
      // a 2026 rebrand should show the 2026 badge, not the 2025 one.
      const latest = m.teams[m.teams.length - 1]
      const team = teamByKey.get(`${latest.seasonYear}:${latest.teamId}`)
      return [
        m.managerId,
        {
          managerId: m.managerId,
          name: m.displayName,
          shortName: team?.shortName ?? m.displayName,
          logoUrl: team?.logoUrl ?? null,
          seasonYears: m.teams.map((t) => t.seasonYear),
        },
      ]
    }),
  )
}

/** Crest + name, the pairing every rivalry component repeats. */
export function crestOf(index: Map<ManagerId, ManagerCard>, id: ManagerId): string | null {
  return index.get(id)?.logoUrl ?? null
}

/** Falls back to the raw id so an unresolvable manager is visible, not blank. */
export function nameOf(index: Map<ManagerId, ManagerCard>, id: ManagerId): string {
  return index.get(id)?.name ?? id
}
