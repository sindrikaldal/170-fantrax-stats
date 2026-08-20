import type { TeamId } from '@/lib/domain/types'

/**
 * Cross-season manager identity overrides.
 *
 * Managers are matched across seasons by exact team name (see
 * lib/stats/managers.ts). Names drift; when a manager renames their team,
 * map the new season's teamId to their canonical manager id here. As of
 * 2026 all eight returning managers kept their exact 2025 team names, so
 * this is empty — it is the escape hatch, not dead code.
 */
export const MANAGER_OVERRIDES: Record<TeamId, string> = {}
