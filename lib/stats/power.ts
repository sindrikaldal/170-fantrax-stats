import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods, scoresForPeriod } from '@/lib/domain/season'

export const POWER_WEIGHTS = { real: 0.4, allPlay: 0.4, form: 0.2 } as const

export interface PowerRanking {
  teamId: TeamId
  /** 0.4·real win % + 0.4·all-play win % + 0.2·form win % (last 6). */
  score: number
  rank: number
  previousRank: number | null
  /** previousRank - rank; positive = climbing. */
  movement: number | null
}

interface Scored {
  teamId: TeamId
  score: number
  pointsFor: number
}

function scoreOver(season: SeasonData, periods: number[], formWindow: number): Scored[] {
  const opponentOf = new Map<string, TeamId>()
  for (const f of season.fixtures) {
    opponentOf.set(`${f.period}:${f.homeTeamId}`, f.awayTeamId)
    opponentOf.set(`${f.period}:${f.awayTeamId}`, f.homeTeamId)
  }
  const scoresByPeriod = new Map(periods.map((p) => [p, scoresForPeriod(season, p)]))
  const formPeriods = new Set(periods.slice(-Math.min(formWindow, periods.length)))

  return season.teams.map(({ teamId }) => {
    let realWinPoints = 0
    let realGames = 0
    let allPlayPoints = 0
    let allPlayGames = 0
    let formWinPoints = 0
    let formGames = 0
    let pointsFor = 0

    for (const [period, scores] of scoresByPeriod) {
      const mine = scores.get(teamId)
      if (mine === undefined) continue
      pointsFor += mine

      const oppId = opponentOf.get(`${period}:${teamId}`)
      const oppScore = oppId === undefined ? undefined : scores.get(oppId)
      if (oppScore !== undefined) {
        const winPoints = mine > oppScore ? 1 : mine === oppScore ? 0.5 : 0
        realWinPoints += winPoints
        realGames += 1
        if (formPeriods.has(period)) {
          formWinPoints += winPoints
          formGames += 1
        }
      }

      for (const [otherId, otherScore] of scores) {
        if (otherId === teamId) continue
        allPlayGames += 1
        if (mine > otherScore) allPlayPoints += 1
        else if (mine === otherScore) allPlayPoints += 0.5
      }
    }

    const real = realGames ? realWinPoints / realGames : 0
    const allPlay = allPlayGames ? allPlayPoints / allPlayGames : 0
    const form = formGames ? formWinPoints / formGames : 0
    return {
      teamId,
      score: POWER_WEIGHTS.real * real + POWER_WEIGHTS.allPlay * allPlay + POWER_WEIGHTS.form * form,
      pointsFor,
    }
  })
}

function rankScored(rows: Scored[]): Scored[] {
  return [...rows].sort(
    (a, b) => b.score - a.score || b.pointsFor - a.pointsFor || a.teamId.localeCompare(b.teamId),
  )
}

export function powerRankings(
  season: SeasonData,
  now: Date,
  formWindow = 6,
): PowerRanking[] {
  const { settled } = auditRegularPeriods(season, now)
  if (settled.length === 0) return []

  const current = rankScored(scoreOver(season, settled, formWindow))
  const previous =
    settled.length >= 2 ? rankScored(scoreOver(season, settled.slice(0, -1), formWindow)) : null
  const previousRankOf = new Map(previous?.map((r, i) => [r.teamId, i + 1]) ?? [])

  return current.map((r, i) => {
    const rank = i + 1
    const previousRank = previous ? (previousRankOf.get(r.teamId) ?? null) : null
    return {
      teamId: r.teamId,
      score: r.score,
      rank,
      previousRank,
      movement: previousRank === null ? null : previousRank - rank,
    }
  })
}
