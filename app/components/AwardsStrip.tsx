import type { ReactNode } from 'react'
import type { SeasonView } from '../lib/season-view'
import { weeklyAwards } from '@/lib/stats/records'
import { formatScore, teamName } from '../lib/format'
import { EmptyState } from './EmptyState'
import { TeamCrest } from './TeamCrest'

const NEEDS_SETTLED = 1

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
  accent: 'money' | 'analysis'
  score: number
  body: ReactNode
  children: ReactNode
}) {
  const accentColor = accent === 'money' ? 'text-money' : 'text-analysis'
  const accentRule = accent === 'money' ? 'bg-money' : 'bg-analysis'
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface p-5">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accentRule}`} aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        {eyebrow}
      </p>
      <h3 className={`mt-1.5 font-display text-xl font-semibold tracking-tight ${accentColor}`}>
        {title}
      </h3>
      {/*
        Static, never animated. This page gets screenshotted into a group
        chat; a mid-animation frame showing the wrong number is a misread,
        not a flourish. The count-up component this used to call has been
        deleted outright.
      */}
      <p className={`mt-2 font-display text-4xl font-semibold tabular-nums ${accentColor}`}>
        {formatScore(score)}
      </p>
      <div className="mt-3 flex items-center gap-2 text-sm font-medium text-ink">{children}</div>
      <p className="prose-measure mt-1 text-sm text-muted">{body}</p>
    </div>
  )
}

/**
 * The most recent settled gameweek's four awards. Locked copy —
 * do not reword the titles. The three decisive awards can be individually
 * null in an all-drawn gameweek; each is skipped on its own rather than
 * hiding the whole strip.
 */
export function AwardsStrip({ view, now = new Date() }: { view: SeasonView; now?: Date }) {
  const { season, settled } = view

  if (settled.length < NEEDS_SETTLED) {
    return <EmptyState needed={NEEDS_SETTLED} have={settled.length} what="Awards need a finished gameweek" />
  }

  const awards = weeklyAwards(season, now)
  const week = awards[awards.length - 1]

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        Gameweek {week.period}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AwardCard
          eyebrow="This week"
          title="Top Score"
          accent="money"
          score={week.topScore.score}
          body="Highest points on the board, full stop."
        >
          {week.topScore.teamIds.map((id) => (
            <span key={id} className="flex items-center gap-1.5">
              <TeamCrest season={season} teamId={id} size="h-6 w-6" />
              {teamName(season, id)}
            </span>
          ))}
        </AwardCard>

        {week.biggestBlowout && (
          <AwardCard
            eyebrow="This week"
            title="The Massacre"
            accent="money"
            score={week.biggestBlowout.margin}
            body={`${teamName(season, week.biggestBlowout.winnerId)} put ${formatScore(week.biggestBlowout.margin)} on ${teamName(season, week.biggestBlowout.loserId)}`}
          >
            <TeamCrest season={season} teamId={week.biggestBlowout.winnerId} size="h-6 w-6" />
            {teamName(season, week.biggestBlowout.winnerId)}
          </AwardCard>
        )}

        {week.unluckiestLoss && (
          <AwardCard
            eyebrow="This week"
            title="Robbed"
            accent="analysis"
            score={week.unluckiestLoss.score}
            body={`Scored ${formatScore(week.unluckiestLoss.score)}. Still lost. Brutal.`}
          >
            <TeamCrest season={season} teamId={week.unluckiestLoss.teamId} size="h-6 w-6" />
            {teamName(season, week.unluckiestLoss.teamId)}
          </AwardCard>
        )}

        {week.luckiestWin && (
          <AwardCard
            eyebrow="This week"
            title="Daylight Robbery"
            accent="analysis"
            score={week.luckiestWin.score}
            body={`Won with ${formatScore(week.luckiestWin.score)}. Shameless.`}
          >
            <TeamCrest season={season} teamId={week.luckiestWin.teamId} size="h-6 w-6" />
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
