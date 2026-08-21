import type { SeasonData, TeamId } from '@/lib/domain/types'
import { CrestImage } from './CrestImage'

/**
 * A team's badge, resolved from the season on the server so the client
 * leaf only ever receives a URL string and a name. Decorative: every crest
 * sits beside the team name it belongs to, so alt text would only repeat
 * it to a screen reader.
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
  const team = season.teams.find((t) => t.teamId === teamId)
  return <CrestImage url={team?.logoUrl ?? null} name={team?.name ?? teamId} size={size} />
}
