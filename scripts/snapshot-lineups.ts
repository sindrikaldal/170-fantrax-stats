/**
 * Capture every settled gameweek's lineups into data/lineups/<year>/gwNN.json.
 *
 *   npx tsx scripts/snapshot-lineups.ts            # every configured season
 *   npx tsx scripts/snapshot-lineups.ts --year 2025
 *
 * Idempotent: a gameweek already captured as final is skipped; one captured
 * while its Fantrax window was still open is re-captured until it closes.
 * A gameweek is written only if every team's starters sum exactly to the
 * score the schedule recorded. A final gameweek failing that check aborts
 * the run, because it means the data cannot be trusted; a provisional one
 * is skipped and retried next run, since corrections may still be landing.
 *
 * No credentials: the league is public. Runs daily from GitHub Actions.
 */
import { LEAGUES, SEASON_YEARS } from '@/config/leagues'
import { loadSeason } from '@/lib/season/load'
import { fetchTeamRosterInfo } from '@/lib/fantrax/client'
import { adaptRosterInfo } from '@/lib/adapt/rosterInfo'
import { auditRegularPeriods } from '@/lib/domain/season'
import {
  readLineupSnapshot,
  verifyLineupSnapshot,
  writeLineupSnapshot,
} from '@/lib/lineups/snapshot'
import type { LineupSnapshot, TeamLineup } from '@/lib/domain/types'

/** Requests in flight at once. Fantrax has no published limit; stay polite. */
const CONCURRENCY = 4

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

function sameLineups(a: LineupSnapshot, b: LineupSnapshot): boolean {
  return (
    a.final === b.final &&
    JSON.stringify(a.teams) === JSON.stringify(b.teams)
  )
}

async function snapshotSeason(year: number, now: Date): Promise<{ written: number; skipped: number }> {
  const leagueId = LEAGUES[year]
  const season = await loadSeason(year)
  const { settled, provisional, withheld } = auditRegularPeriods(season, now)
  console.log(
    `${year}: ${settled.length} settled gameweek(s), ${provisional.length} provisional, ${withheld.length} withheld`,
  )

  let written = 0
  let skipped = 0
  for (const period of settled) {
    const isFinal = !provisional.includes(period)
    const existing = readLineupSnapshot(year, period)
    if (existing?.final) {
      skipped++
      continue
    }

    const teams: TeamLineup[] = await mapLimit(season.teams, CONCURRENCY, async (team) => {
      const raw = await fetchTeamRosterInfo(leagueId, team.teamId, period)
      return { teamId: team.teamId, players: adaptRosterInfo(raw, period, team.teamId) }
    })

    const snapshot: LineupSnapshot = {
      seasonYear: season.seasonYear,
      period,
      final: isFinal,
      capturedAt: now.toISOString(),
      teams,
    }

    // A provisional gameweek is re-fetched daily, but only rewritten when
    // something actually changed; otherwise every run would commit a file
    // whose only difference is the capture timestamp.
    if (existing && sameLineups(existing, snapshot)) {
      skipped++
      continue
    }

    const problems = verifyLineupSnapshot(snapshot, season)
    if (problems.length > 0) {
      const detail = problems.map((p) => `  - ${p}`).join('\n')
      if (isFinal) {
        throw new Error(`${year} GW${period} is final but its lineups do not add up:\n${detail}`)
      }
      console.warn(`${year} GW${period} is provisional and not consistent yet; retrying next run:\n${detail}`)
      skipped++
      continue
    }

    const file = writeLineupSnapshot(snapshot)
    written++
    console.log(`${year} GW${period}: wrote ${file}${isFinal ? '' : ' (provisional)'}`)
  }
  return { written, skipped }
}

async function main() {
  const args = process.argv.slice(2)
  const yearFlag = args.indexOf('--year')
  const years = yearFlag === -1 ? SEASON_YEARS : [Number(args[yearFlag + 1])]
  for (const year of years) {
    if (!LEAGUES[year]) throw new Error(`No league configured for ${year}`)
  }

  const now = new Date()
  let totalWritten = 0
  for (const year of [...years].sort()) {
    const { written } = await snapshotSeason(year, now)
    totalWritten += written
  }
  console.log(totalWritten === 0 ? 'Nothing new to capture.' : `Wrote ${totalWritten} gameweek file(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
