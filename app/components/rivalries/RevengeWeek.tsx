import Link from 'next/link'
import type { ManagerId } from '@/lib/domain/types'
import type { RevengeFixture } from '@/lib/stats/rivalries'
import { managerHref, type ManagerCard } from '../../lib/manager-view'
import { CrestImage } from '../CrestImage'
import { formatScore } from '../../lib/format'


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
 *
 * With `focusManagerId` set (the manager page) the scope changes to that
 * manager's next grudge fixture of each kind — the next one they owe and
 * the next one owed to them — from their point of view. Two cards at most:
 * a season's worth of grudges for one manager was a wall of fifteen.
 */
export function RevengeWeek({
  fixtures,
  managers,
  focusManagerId,
}: {
  fixtures: RevengeFixture[]
  managers: ManagerCard[]
  focusManagerId?: ManagerId
}) {
  const cardById = new Map(managers.map((m) => [m.managerId, m]))

  const scoped = focusManagerId
    ? fixtures.filter((f) => f.managerId === focusManagerId || f.opponentId === focusManagerId)
    : fixtures

  if (scoped.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Revenge Week
        </p>
        <p className="prose-measure mx-auto mt-2 text-sm text-muted">
          {focusManagerId
            ? 'No scores to settle in the fixtures ahead — nothing owed either way.'
            : 'No scores to settle in the fixtures ahead. Either nobody is owed anything, or this season is already over.'}
        </p>
      </div>
    )
  }

  const nextPeriod = Math.min(...scoped.map((f) => f.period))
  const byPeriod = (a: RevengeFixture, b: RevengeFixture) =>
    a.period - b.period ||
    (cardById.get(a.managerId)?.name ?? a.managerId).localeCompare(
      cardById.get(b.managerId)?.name ?? b.managerId,
      'is',
    )
  const ordered = focusManagerId
    ? [
        scoped.filter((f) => f.managerId === focusManagerId).sort(byPeriod)[0],
        scoped.filter((f) => f.opponentId === focusManagerId).sort(byPeriod)[0],
      ].filter((f): f is RevengeFixture => f !== undefined)
    : scoped.filter((f) => f.period === nextPeriod).sort(byPeriod)
  const laterCount = scoped.length - ordered.length
  const season = ordered[0].seasonYear

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ordered.map((f) => {
        // From the focused manager's side when they are the one owed revenge
        // against; otherwise from the side of whoever lost last time.
        const owedToFocus = focusManagerId !== undefined && f.opponentId === focusManagerId
        const meId = owedToFocus ? f.opponentId : f.managerId
        const themId = owedToFocus ? f.managerId : f.opponentId
        const me = cardById.get(meId)
        const them = cardById.get(themId)
        const last = owedToFocus
          ? {
              ...f.lastMeeting,
              forScore: f.lastMeeting.againstScore,
              againstScore: f.lastMeeting.forScore,
              margin: -f.lastMeeting.margin,
            }
          : f.lastMeeting
        return (
          <div
            key={`${f.period}-${f.managerId}`}
            className="relative overflow-hidden rounded-lg border border-line bg-surface p-5"
          >
            <div
              aria-hidden
              className={`absolute inset-x-0 top-0 h-0.5 ${owedToFocus ? 'bg-money' : 'bg-analysis'}`}
            />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Revenge Week &middot; GW{f.period} &rsquo;{String(f.seasonYear).slice(2)}
            </p>
            <h4
              className={`mt-1.5 font-display text-xl font-semibold tracking-tight ${owedToFocus ? 'text-money' : 'text-analysis'}`}
            >
              {owedToFocus ? 'They owe you one' : 'You owe them one'}
            </h4>

            <div className="mt-3 space-y-1.5 text-sm">
              <p className="flex min-w-0 items-center gap-2 font-medium text-ink">
                <CrestImage url={me?.logoUrl ?? null} name={me?.name ?? ''} />
                <Link
                  href={managerHref(meId)}
                  className="min-w-0 truncate hover:text-money"
                  title={me?.name}
                >
                  {me?.name ?? meId}
                </Link>
              </p>
              <p className="flex min-w-0 items-center gap-2 text-muted">
                <span className="w-5 shrink-0 text-center text-xs">vs</span>
                <CrestImage url={them?.logoUrl ?? null} name={them?.name ?? ''} />
                <Link
                  href={managerHref(themId)}
                  className="min-w-0 truncate text-ink hover:text-money"
                  title={them?.name}
                >
                  {them?.name ?? themId}
                </Link>
              </p>
            </div>

            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
              Last time, GW{last.period} &rsquo;{String(last.seasonYear).slice(2)}:{' '}
              <span className="tabular-nums text-ink">
                {formatScore(last.forScore)}
                <span className="mx-1 text-muted">&ndash;</span>
                <span className="font-semibold">{formatScore(last.againstScore)}</span>
              </span>{' '}
              <span className={`whitespace-nowrap ${last.margin < 0 ? 'text-down' : 'text-up'}`}>
                ({last.margin < 0 ? '−' : '+'}{formatScore(Math.abs(last.margin))})
              </span>
            </p>
          </div>
        )
      })}
      </div>
      {laterCount > 0 && (
        <p className="prose-measure mt-3 text-sm text-muted">
          {focusManagerId ? 'Next of each kind only.' : `Gameweek ${nextPeriod} of ${season} only.`}{' '}
          Another {laterCount} grudge fixture{laterCount === 1 ? '' : 's'}{' '}
          {laterCount === 1 ? 'is' : 'are'} scheduled later in the season.
        </p>
      )}
    </div>
  )
}
