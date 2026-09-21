import type { TeamId } from '@/lib/domain/types'

/**
 * Cross-season manager identity overrides.
 *
 * Managers are matched across seasons by exact team name (see
 * lib/stats/managers.ts). Names drift; when a manager renames their team,
 * map the new season's teamId to their canonical manager id here — the
 * slug of the name they used in their first season, so earlier ids and
 * manager-page URLs stay valid. The display name follows the latest team.
 *
 * Ground truth is the owner's Fantrax username, which `getTeamRosterInfo`
 * reports per team as `teamHeadingInfo.owners.value`. Checked 2026-09-21
 * across all 24 teams of both seasons: eight usernames own a team in each
 * season, six of them under an unchanged name and these two under a new
 * one. (Note "Sigurdur" and "Sigurður" are different accounts.)
 *
 *   EynalRaps  2025 "Year of the Diallo"               → 2026 "Ballon d’orGU"
 *   Sigurdur   2025 "Proof the Curse lives once more"  → 2026 "Curse lifted finally?"
 *
 * Both renamed mid-season, after the 2026 fixture was captured, which is
 * why the fixture still shows the old names and why name matching alone
 * silently split each of them into two managers with no shared history.
 */
export const MANAGER_OVERRIDES: Record<TeamId, string> = {
  // 2026
  '5epxm3edmsyix1uy': 'year-of-the-diallo',
  'wv6m2nnjmsyix1uy': 'proof-the-curse-lives-once-more',
}
