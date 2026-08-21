import type { SeasonData, TeamId } from '@/lib/domain/types'

/**
 * A team's Fantrax badge. Decorative: every crest sits beside the team
 * name it belongs to, so alt text would only repeat it to a screen reader.
 *
 * Renders nothing when a team has no logo — Fantrax leaves `logoUrl` null
 * for teams that never set one, and an empty box is worse than no box.
 */
export function TeamCrest({
  season,
  teamId,
  size = 'h-5 w-5',
}: {
  season: SeasonData
  teamId: TeamId
  size?: string
}) {
  const logoUrl = season.teams.find((t) => t.teamId === teamId)?.logoUrl ?? null
  if (!logoUrl) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={logoUrl} alt="" className={`${size} shrink-0 rounded-sm object-cover`} />
  )
}
