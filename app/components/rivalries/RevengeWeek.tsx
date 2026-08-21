import type { RevengeFixture } from '@/lib/stats/rivalries'
import type { ManagerCard } from '../../lib/manager-view'
import { formatScore } from '../../lib/format'

function Crest({ card, size = 'h-5 w-5' }: { card: ManagerCard | undefined; size?: string }) {
  if (!card?.logoUrl) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={card.logoUrl} alt="" className={`${size} shrink-0 rounded-sm object-cover`} />
  )
}

/**
 * Revenge fixtures in the *next* gameweek only.
 *
 * `revengeFixtures` returns every remaining fixture in the season where
 * one side lost the last meeting, which across a 35-gameweek 14-team
 * season is around 75 of them — a wall of cards nobody reads, most of
 * them months away. "Revenge Week" is a week: scoping to the earliest
 * upcoming period is what the name promises, and it caps the card count
 * at one per real fixture.
 *
 * Narrowing here rather than in `lib/stats/` deliberately — the full list
 * is the correct answer to "who is owed a rematch", and a later component
 * (a season-long grudge list) may well want all of it.
 *
 * Unlike the rest of this section these point forward, so they belong to
 * whichever season is still being played, not the one whose page you are
 * on — hence the year in the label.
 */
export function RevengeWeek({
  fixtures,
  managers,
}: {
  fixtures: RevengeFixture[]
  managers: ManagerCard[]
}) {
  const cardById = new Map(managers.map((m) => [m.managerId, m]))

  if (fixtures.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Revenge Week
        </p>
        <p className="prose-measure mx-auto mt-2 text-sm text-muted">
          No scores to settle in the fixtures ahead. Either nobody is owed anything, or
          this season is already over.
        </p>
      </div>
    )
  }

  const nextPeriod = Math.min(...fixtures.map((f) => f.period))
  const ordered = fixtures
    .filter((f) => f.period === nextPeriod)
    .sort((a, b) =>
      (cardById.get(a.managerId)?.name ?? a.managerId).localeCompare(
        cardById.get(b.managerId)?.name ?? b.managerId,
        'is',
      ),
    )
  const laterCount = fixtures.length - ordered.length
  const season = ordered[0].seasonYear

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ordered.map((f) => {
        const me = cardById.get(f.managerId)
        const them = cardById.get(f.opponentId)
        const { lastMeeting: last } = f
        return (
          <div
            key={`${f.period}-${f.managerId}`}
            className="relative overflow-hidden rounded-lg border border-line bg-surface p-5"
          >
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-analysis" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Revenge Week &middot; GW{f.period} &rsquo;{String(f.seasonYear).slice(2)}
            </p>
            <h4 className="mt-1.5 font-display text-xl font-semibold tracking-tight text-analysis">
              You owe them one
            </h4>

            <div className="mt-3 space-y-1.5 text-sm">
              <p className="flex min-w-0 items-center gap-2 font-medium text-ink">
                <Crest card={me} />
                <span className="min-w-0 truncate" title={me?.name}>
                  {me?.name ?? f.managerId}
                </span>
              </p>
              <p className="flex min-w-0 items-center gap-2 text-muted">
                <span className="w-5 shrink-0 text-center text-xs">vs</span>
                <Crest card={them} />
                <span className="min-w-0 truncate text-ink" title={them?.name}>
                  {them?.name ?? f.opponentId}
                </span>
              </p>
            </div>

            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
              Last time, GW{last.period} &rsquo;{String(last.seasonYear).slice(2)}:{' '}
              <span className="tabular-nums text-ink">
                {formatScore(last.forScore)}
                <span className="mx-1 text-muted">&ndash;</span>
                <span className="font-semibold">{formatScore(last.againstScore)}</span>
              </span>{' '}
              <span className="whitespace-nowrap text-down">
                (−{formatScore(Math.abs(last.margin))})
              </span>
            </p>
          </div>
        )
      })}
      </div>
      {laterCount > 0 && (
        <p className="prose-measure mt-3 text-sm text-muted">
          Gameweek {nextPeriod} of {season} only. Another {laterCount} grudge fixture
          {laterCount === 1 ? '' : 's'} {laterCount === 1 ? 'is' : 'are'} scheduled later in
          the season.
        </p>
      )}
    </div>
  )
}
