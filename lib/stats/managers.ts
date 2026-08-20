import type { ManagerId, SeasonData, TeamId } from '@/lib/domain/types'
import { MANAGER_OVERRIDES } from '@/config/managers'

export interface ManagerTeam {
  seasonYear: number
  teamId: TeamId
  teamName: string
}

export interface Manager {
  managerId: ManagerId
  /** Team name from the manager's most recent season. */
  displayName: string
  /** One entry per season, ascending by year. */
  teams: ManagerTeam[]
}

export interface ManagerResolution {
  managers: Manager[]
  /** Managers present in two or more seasons. */
  returning: Manager[]
  /**
   * Teams matched to no other season. Surfaced explicitly — a rename that
   * slipped past MANAGER_OVERRIDES shows up here, never silently dropped.
   */
  singleSeason: Manager[]
}

/** Deterministic id from a team name: NFKD, strip accents, kebab-case. */
export function slugifyManagerId(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function resolveManagers(
  seasons: SeasonData[],
  overrides: Record<TeamId, string> = MANAGER_OVERRIDES,
): ManagerResolution {
  const byManager = new Map<ManagerId, ManagerTeam[]>()
  const ordered = [...seasons].sort((a, b) => a.seasonYear - b.seasonYear)

  for (const season of ordered) {
    const seenThisSeason = new Map<ManagerId, string>()
    for (const team of season.teams) {
      const managerId = overrides[team.teamId] ?? slugifyManagerId(team.name)
      const clash = seenThisSeason.get(managerId)
      if (clash !== undefined) {
        throw new Error(
          `Teams "${clash}" and "${team.name}" in season ${season.seasonYear} ` +
            `resolve to the same manager "${managerId}" — fix config/managers.ts`,
        )
      }
      seenThisSeason.set(managerId, team.name)
      const teams = byManager.get(managerId) ?? []
      teams.push({ seasonYear: season.seasonYear, teamId: team.teamId, teamName: team.name })
      byManager.set(managerId, teams)
    }
  }

  const managers: Manager[] = [...byManager.entries()]
    .map(([managerId, teams]) => ({
      managerId,
      displayName: teams[teams.length - 1].teamName,
      teams,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'is'))

  return {
    managers,
    returning: managers.filter((m) => m.teams.length >= 2),
    singleSeason: managers.filter((m) => m.teams.length === 1),
  }
}
