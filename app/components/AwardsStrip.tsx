import type { ReactNode } from 'react'
import type { SeasonView } from '../lib/season-view'
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { weeklyAwards } from '@/lib/stats/records'
import { teamName } from '../lib/format'
import { EmptyState } from './EmptyState'
import { CountUp } from './CountUp'

const NEEDS_SETTLED = 1

function Crest({ season, teamId }: { season: SeasonData; teamId: TeamId }) {
  const logo = season.teams.find((t) => t.teamId === teamId)?.logoUrl ?? null
  if (!logo) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={logo} alt="" className="h-6 w-6 shrink-0 rounded-sm object-cover" />
  )
}

function AwardCard({
  eyebrow,
  title,
  accent,
  score,
  body,
  children,
}: {
  eyebrow: string
  title: string
  accent: 'gold' | 'cold'
  score: number
  body: ReactNode
  children: ReactNode
}) {
  const accentColor = accent === 'gold' ? 'text-gold' : 'text-cold'
  const barGradient =
    accent === 'gold'
      ? 'from-gold/70 to-gold/0'
      : 'from-cold/70 to-cold/0'
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface p-4">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${barGradient}`} aria-hidden />
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
        {eyebrow}
      </p>
      <h3 className={`mt-1 font-display text-xl font-extrabold uppercase tracking-wide ${accentColor}`}>
        {title}
      </h3>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`font-display text-4xl font-extrabold tabular-nums ${accentColor}`}>
          <CountUp value={score} />
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm text-foreground">{children}</div>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  )
}

/**
 * The most recent settled gameweek's four broadcast awards. Locked copy —
 * do not reword the titles. The three decisive awards can be individually
 * null in an all-drawn gameweek; each is skipped on its own rather than
 * hiding the whole strip.
 */
export function AwardsStrip({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return <EmptyState needed={NEEDS_SETTLED} have={settled.length} what="This week's awards" />
  }

  const awards = weeklyAwards(season, now)
  const week = awards[awards.length - 1]

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        Gameweek {week.period}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AwardCard
          eyebrow="This week"
          title="Top Score"
          accent="gold"
          score={week.topScore.score}
          body="Highest points on the board, full stop."
        >
          {week.topScore.teamIds.map((id) => (
            <span key={id} className="flex items-center gap-1.5">
              <Crest season={season} teamId={id} />
              {teamName(season, id)}
            </span>
          ))}
        </AwardCard>

        {week.biggestBlowout && (
          <AwardCard
            eyebrow="This week"
            title="The Massacre"
            accent="gold"
            score={week.biggestBlowout.margin}
            body={`${teamName(season, week.biggestBlowout.winnerId)} put ${week.biggestBlowout.margin.toFixed(1)} on ${teamName(season, week.biggestBlowout.loserId)}`}
          >
            <Crest season={season} teamId={week.biggestBlowout.winnerId} />
            {teamName(season, week.biggestBlowout.winnerId)}
          </AwardCard>
        )}

        {week.unluckiestLoss && (
          <AwardCard
            eyebrow="This week"
            title="Robbed"
            accent="cold"
            score={week.unluckiestLoss.score}
            body={`Scored ${week.unluckiestLoss.score.toFixed(1)}. Still lost. Brutal.`}
          >
            <Crest season={season} teamId={week.unluckiestLoss.teamId} />
            {teamName(season, week.unluckiestLoss.teamId)}
          </AwardCard>
        )}

        {week.luckiestWin && (
          <AwardCard
            eyebrow="This week"
            title="Daylight Robbery"
            accent="cold"
            score={week.luckiestWin.score}
            body={`Won with ${week.luckiestWin.score.toFixed(1)}. Shameless.`}
          >
            <Crest season={season} teamId={week.luckiestWin.teamId} />
            {teamName(season, week.luckiestWin.teamId)}
          </AwardCard>
        )}
      </div>
      {!week.biggestBlowout && !week.unluckiestLoss && !week.luckiestWin && (
        <p className="mt-3 text-sm text-muted">
          Every game this week was a draw. No blowouts, no robberies &mdash; just chaos.
        </p>
      )}
    </div>
  )
}
