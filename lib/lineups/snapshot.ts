import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { LineupSnapshot, SeasonData } from '@/lib/domain/types'
import { scoresForPeriod } from '@/lib/domain/season'

/**
 * Committed per-gameweek lineups live here, one directory per season and
 * one file per gameweek. They are written only by `scripts/snapshot-lineups.ts`
 * and read by the app; nothing fetches lineups while rendering a page.
 */
export const LINEUPS_DIR = 'data/lineups'

const PositionSchema = z.enum(['G', 'D', 'M', 'F'])

/** The committed file format. Internal shape — no Fantrax field names. */
export const LineupSnapshotSchema = z.object({
  seasonYear: z.number().int(),
  period: z.number().int().positive(),
  final: z.boolean(),
  capturedAt: z.string(),
  teams: z.array(
    z.object({
      teamId: z.string(),
      players: z.array(
        z.object({
          playerId: z.string(),
          name: z.string(),
          positions: z.array(PositionSchema).min(1),
          starter: z.boolean(),
          points: z.number(),
        }),
      ),
    }),
  ),
})

function seasonDir(year: number): string {
  return path.join(process.cwd(), LINEUPS_DIR, String(year))
}

export function snapshotPath(year: number, period: number): string {
  return path.join(seasonDir(year), `gw${String(period).padStart(2, '0')}.json`)
}

export function readLineupSnapshot(year: number, period: number): LineupSnapshot | null {
  const file = snapshotPath(year, period)
  if (!existsSync(file)) return null
  return LineupSnapshotSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
}

/** Every committed gameweek for a season, ascending by period. Empty when none exist. */
export function readLineupSnapshots(year: number): LineupSnapshot[] {
  const dir = seasonDir(year)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^gw\d+\.json$/.test(f))
    .map((f) => LineupSnapshotSchema.parse(JSON.parse(readFileSync(path.join(dir, f), 'utf8'))))
    .sort((a, b) => a.period - b.period)
}

export function writeLineupSnapshot(snapshot: LineupSnapshot): string {
  const file = snapshotPath(snapshot.seasonYear, snapshot.period)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(LineupSnapshotSchema.parse(snapshot), null, 1) + '\n')
  return file
}

/**
 * The cross-check that makes a snapshot trustworthy: every team that scored
 * in the gameweek must be present, and its starters' points must sum to
 * exactly the score Fantrax recorded for it in the schedule. Returns one
 * message per problem; an empty array means the snapshot is consistent.
 */
export function verifyLineupSnapshot(snapshot: LineupSnapshot, season: SeasonData): string[] {
  const problems: string[] = []
  if (snapshot.seasonYear !== season.seasonYear) {
    problems.push(`snapshot is for ${snapshot.seasonYear}, season is ${season.seasonYear}`)
  }
  const scores = scoresForPeriod(season, snapshot.period)
  const byTeam = new Map(snapshot.teams.map((t) => [t.teamId, t]))
  for (const [teamId, score] of scores) {
    const team = byTeam.get(teamId)
    if (!team) {
      problems.push(`GW${snapshot.period}: no lineup for team ${teamId}`)
      continue
    }
    const sum = team.players.filter((p) => p.starter).reduce((s, p) => s + p.points, 0)
    if (Math.abs(sum - score) > 1e-6) {
      problems.push(
        `GW${snapshot.period}: team ${teamId} starters sum to ${sum}, schedule says ${score}`,
      )
    }
  }
  for (const team of snapshot.teams) {
    if (!scores.has(team.teamId)) {
      problems.push(`GW${snapshot.period}: lineup for unknown team ${team.teamId}`)
    }
  }
  return problems
}
