import Link from 'next/link'
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { managerIdForTeam } from '@/lib/stats/managers'
import { managerHref } from '../lib/manager-view'
import { teamName } from '../lib/format'

/**
 * A team's name as a link to its manager's page. Every table and card
 * that names a team renders it through this, so the whole site agrees on
 * where a name leads. Inline by design — it slots into the existing
 * crest-plus-name layouts, and a truncating parent still truncates it.
 */
export function TeamName({
  season,
  teamId,
  label,
  className = '',
}: {
  season: SeasonData
  teamId: TeamId
  /** Shown instead of the full name (e.g. a short name); the title keeps the full one. */
  label?: string
  className?: string
}) {
  const name = teamName(season, teamId)
  return (
    <Link
      href={managerHref(managerIdForTeam(season, teamId))}
      title={name}
      className={`rounded-sm transition-colors hover:text-money ${className}`}
    >
      {label ?? name}
    </Link>
  )
}
