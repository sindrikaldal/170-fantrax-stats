# Foundation and Prize Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Fantrax data layer and ship the gameweek prize-money ledger as a working page for both the 2025 and 2026 seasons.

**Architecture:** Raw Fantrax JSON is validated with Zod and adapted into one internal `SeasonData` shape; every stat function depends only on `SeasonData`, never on Fantrax field names. Stats are pure functions with no I/O, tested against committed fixtures of the real 2025 season. Next.js server components fetch and cache; no database, no cron, no secrets.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React, Tailwind CSS v4, Zod, Vitest.

## Global Constraints

- Node.js 20.11+ required (verified local: v20.19.5). Next.js 16 needs 20.9+, and `vitest.config.mts` uses `import.meta.dirname`, which needs 20.11+.
- **No authentication anywhere.** The league is public-readable. No cookies, no API keys, no `.env` secrets. If a task seems to need auth, the task is wrong.
- **No network calls in tests.** All tests read committed fixtures from `test/fixtures/`.
- Every stat function is pure: `SeasonData` in, plain data out. No `fetch`, no `Date.now()` inside stat functions — pass `now` as a parameter so tests are deterministic.
- League IDs: 2026 = `ywhebyp7msyix1sj`, 2025 = `7he4pkgpme8uz58b`. `leagueHistoryId` = `6yst2cj3l5tiizya`.
- Gameweek prize: **1500 ISK** to the highest-scoring team, gameweeks **1–35 only**, ties **split evenly** (`1500 / winners.length`), `*League Average*` **never eligible**.
- The prize rule is **new for 2026**. 2025 ledger output is **hypothetical** and every 2025 ledger view must be labelled as such in the UI. It is never presented as money owed.
- A gameweek counts for the ledger only when it is **complete** (its `endDate` has passed). A score of `0` in an unplayed gameweek is not a real score.
- Money is displayed, so ledger correctness outranks everything else. Ledger tests are non-negotiable.

## File Structure

| File | Responsibility |
|---|---|
| `config/leagues.ts` | Season year → league ID registry. Single source of truth for which seasons exist. |
| `lib/domain/types.ts` | `SeasonData` and its members. No logic, no dependencies. |
| `lib/domain/season.ts` | Derived helpers over `SeasonData` (`scoresForPeriod`, `isPeriodComplete`). |
| `lib/fantrax/schemas.ts` | Zod schemas for raw Fantrax responses. The only place field names appear. |
| `lib/fantrax/client.ts` | HTTP: `fxea` GETs and `fxpa` POSTs. Returns validated raw objects. |
| `lib/adapt/leagueInfo.ts` | `getLeagueInfo` → teams, periods, settings, fixture skeleton. |
| `lib/adapt/schedule.ts` | `fxpa` schedule → fixtures and average-fixtures with scores. |
| `lib/adapt/season.ts` | Composes the adapters into one `SeasonData`. |
| `lib/stats/ledger.ts` | Prize ledger. Pure. |
| `lib/season/load.ts` | Cached season loading for server components. The only file that does I/O and caching. |
| `app/page.tsx` | Ledger page. |
| `app/components/LedgerTable.tsx` | Ledger presentation. |

`config/managers.ts` (cross-season manager identity) is **not** built in this plan. The
ledger is per-season and needs no cross-season identity, so it arrives with the rivalries
plan — the first consumer that actually requires it.

Splitting `adapt/` by source endpoint rather than into one big file keeps each adapter small enough to hold in context, and means an `fxpa` shape change touches exactly one file.

---

### Task 1: Project scaffold with a passing test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `postcss.config.mjs`
- Create test: `lib/domain/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test` and `npm run dev`. All later tasks assume Vitest resolves `@/` to the repo root.

- [ ] **Step 1: Scaffold Next.js**

Run in the repo root (it already contains `.git`, `docs/`, `test/fixtures/`):

```bash
npx --yes create-next-app@latest . --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --yes
```

If it refuses because the directory is non-empty, answer yes to proceed; it does not delete `docs/` or `test/`.

- [ ] **Step 2: Add test and validation dependencies**

```bash
npm install zod
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 4: Add the test script to `package.json`**

Add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a failing smoke test**

Create `lib/domain/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('fixtures', () => {
  it('the 2025 schedule fixture is present and parseable', () => {
    const raw = readFileSync('test/fixtures/2025/fxpa-getStandings-schedule.json', 'utf8')
    const json = JSON.parse(raw)
    expect(json.responses[0].data.tableList).toHaveLength(35)
  })
})
```

- [ ] **Step 6: Run the test**

Run: `npm test`
Expected: PASS, 1 test. If `tableList` is not 35, stop — the fixture is wrong and every later task depends on it.

- [ ] **Step 7: Verify the dev server boots**

Run: `npm run dev`
Expected: serves on http://localhost:3000 without errors. Stop it with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app with Vitest harness"
```

---

### Task 2: Domain types and league configuration

**Files:**
- Create: `lib/domain/types.ts`, `config/leagues.ts`
- Create test: `lib/domain/types.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type TeamId = string`, `type ManagerId = string`
  - `interface Team { teamId: TeamId; name: string; shortName: string | null; logoUrl: string | null }`
  - `interface Period { number: number; startDate: string; endDate: string }`
  - `interface Fixture { period: number; homeTeamId: TeamId; awayTeamId: TeamId; homeScore: number | null; awayScore: number | null }`
  - `interface AverageFixture { period: number; teamId: TeamId; teamScore: number | null; averageScore: number | null }`
  - `interface SeasonData { seasonYear: number; leagueId: string; leagueName: string; regularSeasonPeriods: number; totalPeriods: number; teams: Team[]; periods: Period[]; fixtures: Fixture[]; averageFixtures: AverageFixture[] }`
  - `const LEAGUES: Record<number, string>`, `const SEASON_YEARS: number[]`

- [ ] **Step 1: Write the failing test**

Create `lib/domain/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LEAGUES, SEASON_YEARS } from '@/config/leagues'

describe('league config', () => {
  it('registers both seasons with their real league IDs', () => {
    expect(LEAGUES[2026]).toBe('ywhebyp7msyix1sj')
    expect(LEAGUES[2025]).toBe('7he4pkgpme8uz58b')
  })

  it('lists season years newest first', () => {
    expect(SEASON_YEARS).toEqual([2026, 2025])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/domain/types.test.ts`
Expected: FAIL — cannot resolve `@/config/leagues`.

- [ ] **Step 3: Create `lib/domain/types.ts`**

```ts
export type TeamId = string
export type ManagerId = string

export interface Team {
  teamId: TeamId
  name: string
  shortName: string | null
  logoUrl: string | null
}

export interface Period {
  number: number
  /** ISO 8601, from Fantrax scoringPeriods */
  startDate: string
  endDate: string
}

/** A real head-to-head fixture. Scores are null until the gameweek is complete. */
export interface Fixture {
  period: number
  homeTeamId: TeamId
  awayTeamId: TeamId
  homeScore: number | null
  awayScore: number | null
}

/**
 * A team's second fixture of the gameweek, against the league mean.
 * Every team has exactly one of these per period.
 */
export interface AverageFixture {
  period: number
  teamId: TeamId
  teamScore: number | null
  averageScore: number | null
}

export interface SeasonData {
  seasonYear: number
  leagueId: string
  leagueName: string
  /** Last gameweek of the regular season, 35 in both known seasons. */
  regularSeasonPeriods: number
  totalPeriods: number
  teams: Team[]
  periods: Period[]
  /** Real matchups only. Never contains *League Average* rows. */
  fixtures: Fixture[]
  averageFixtures: AverageFixture[]
}
```

- [ ] **Step 4: Create `config/leagues.ts`**

```ts
/**
 * Fantrax issues a new leagueId per season. leagueHistoryId 6yst2cj3l5tiizya
 * is stable across all seasons of "170 Broskis".
 */
export const LEAGUE_HISTORY_ID = '6yst2cj3l5tiizya'

export const LEAGUES: Record<number, string> = {
  2026: 'ywhebyp7msyix1sj',
  2025: '7he4pkgpme8uz58b',
}

/** Newest first, for UI ordering. */
export const SEASON_YEARS: number[] = Object.keys(LEAGUES)
  .map(Number)
  .sort((a, b) => b - a)

export const CURRENT_SEASON = SEASON_YEARS[0]
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test lib/domain/types.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/types.ts lib/domain/types.test.ts config/leagues.ts
git commit -m "Add domain types and league registry"
```

---

### Task 3: Zod schemas and the Fantrax client

**Files:**
- Create: `lib/fantrax/schemas.ts`, `lib/fantrax/client.ts`
- Create test: `lib/fantrax/schemas.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `LeagueInfoSchema`, `type RawLeagueInfo`
  - `ScheduleResponseSchema`, `type RawScheduleResponse`
  - `StandingsSchema`, `type RawStandings`
  - `fetchLeagueInfo(leagueId: string): Promise<RawLeagueInfo>`
  - `fetchSchedule(leagueId: string): Promise<RawScheduleResponse>`
  - `fetchStandings(leagueId: string): Promise<RawStandings>`

Schemas are deliberately permissive with `.passthrough()` on outer objects: Fantrax sends many fields we do not use, and rejecting unknown keys would break on every unrelated Fantrax change. We validate only what we consume.

- [ ] **Step 1: Write the failing test**

Create `lib/fantrax/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema, StandingsSchema } from '@/lib/fantrax/schemas'

const load = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

describe('LeagueInfoSchema', () => {
  it('parses the 2026 league info fixture', () => {
    const parsed = LeagueInfoSchema.parse(load('test/fixtures/2026/getLeagueInfo.json'))
    expect(parsed.leagueName).toBe('170 Broskis')
    expect(parsed.seasonYear).toBe(2026)
    expect(parsed.scoringPeriods).toHaveLength(38)
    expect(parsed.playoffs.lastRegularSeasonPeriod).toBe(35)
    expect(Object.keys(parsed.teamInfo)).toHaveLength(14)
  })

  it('parses the 2025 league info fixture, which has 10 teams', () => {
    const parsed = LeagueInfoSchema.parse(load('test/fixtures/2025/getLeagueInfo.json'))
    expect(parsed.seasonYear).toBe(2025)
    expect(Object.keys(parsed.teamInfo)).toHaveLength(10)
  })
})

describe('ScheduleResponseSchema', () => {
  it('parses all 35 gameweek tables from the 2025 fixture', () => {
    const parsed = ScheduleResponseSchema.parse(
      load('test/fixtures/2025/fxpa-getStandings-schedule.json'),
    )
    const tables = parsed.responses[0].data.tableList
    expect(tables).toHaveLength(35)
    expect(tables[0].caption).toBe('Gameweek 1')
    // 5 real matchups + 10 league-average rows for a 10-team league
    expect(tables[0].rows).toHaveLength(15)
  })
})

describe('StandingsSchema', () => {
  it('parses the 2025 final standings', () => {
    const parsed = StandingsSchema.parse(load('test/fixtures/2025/getStandings.json'))
    expect(parsed).toHaveLength(10)
    expect(parsed[0].teamName).toBe('Leibbi davíðs')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/fantrax/schemas.test.ts`
Expected: FAIL — cannot resolve `@/lib/fantrax/schemas`.

- [ ] **Step 3: Create `lib/fantrax/schemas.ts`**

```ts
import { z } from 'zod'

/** ---------- fxea/general/getLeagueInfo ---------- */

const ScoringPeriodSchema = z.object({
  number: z.number(),
  startDate: z.string(),
  endDate: z.string(),
})

const TeamInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const LeagueInfoSchema = z
  .object({
    leagueName: z.string(),
    seasonYear: z.number(),
    leagueHistoryId: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    scoringPeriods: z.array(ScoringPeriodSchema),
    teamInfo: z.record(z.string(), TeamInfoSchema),
    playoffs: z
      .object({
        lastRegularSeasonPeriod: z.number(),
        firstPlayoffPeriod: z.number(),
        numPlayoffTeams: z.number(),
      })
      .passthrough(),
  })
  .passthrough()

export type RawLeagueInfo = z.infer<typeof LeagueInfoSchema>

/** ---------- fxpa/req getStandings, view SCHEDULE ---------- */

/**
 * A cell in a schedule row. Real team cells carry teamId; the
 * *League Average* pseudo-team cell does not. That absence is the
 * discriminator between a real fixture and an average fixture, and it is
 * structural rather than name-based, so it survives team renames.
 */
const ScheduleCellSchema = z
  .object({
    content: z.string(),
    teamId: z.string().optional(),
  })
  .passthrough()

const ScheduleRowSchema = z
  .object({
    cells: z.array(ScheduleCellSchema),
  })
  .passthrough()

const ScheduleTableSchema = z
  .object({
    caption: z.string(),
    rows: z.array(ScheduleRowSchema),
  })
  .passthrough()

const FantasyTeamInfoSchema = z
  .object({
    name: z.string(),
    shortName: z.string().optional(),
    logoUrl512: z.string().optional(),
  })
  .passthrough()

export const ScheduleResponseSchema = z
  .object({
    responses: z
      .array(
        z
          .object({
            data: z
              .object({
                tableList: z.array(ScheduleTableSchema),
                fantasyTeamInfo: z.record(z.string(), FantasyTeamInfoSchema),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough()

export type RawScheduleResponse = z.infer<typeof ScheduleResponseSchema>

/** ---------- fxea/general/getStandings ---------- */

export const StandingsSchema = z.array(
  z
    .object({
      teamId: z.string(),
      teamName: z.string(),
      rank: z.number(),
      points: z.string(),
      totalPointsFor: z.number(),
      winPercentage: z.number(),
    })
    .passthrough(),
)

export type RawStandings = z.infer<typeof StandingsSchema>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test lib/fantrax/schemas.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Create `lib/fantrax/client.ts`**

```ts
import {
  LeagueInfoSchema,
  ScheduleResponseSchema,
  StandingsSchema,
  type RawLeagueInfo,
  type RawScheduleResponse,
  type RawStandings,
} from './schemas'

const FXEA = 'https://www.fantrax.com/fxea/general'
const FXPA = 'https://www.fantrax.com/fxpa/req'

/** Revalidation window for live season data, in seconds. */
const LIVE_TTL = 1800

class FantraxError extends Error {
  constructor(endpoint: string, cause: string) {
    super(`Fantrax request failed (${endpoint}): ${cause}`)
    this.name = 'FantraxError'
  }
}

async function getJson(url: string, endpoint: string, ttl: number): Promise<unknown> {
  const res = await fetch(url, { next: { revalidate: ttl } })
  if (!res.ok) throw new FantraxError(endpoint, `HTTP ${res.status}`)
  return res.json()
}

export async function fetchLeagueInfo(leagueId: string): Promise<RawLeagueInfo> {
  // Schedule and settings are immutable once the season starts; cache hard.
  const json = await getJson(
    `${FXEA}/getLeagueInfo?leagueId=${leagueId}`,
    'getLeagueInfo',
    86400,
  )
  return LeagueInfoSchema.parse(json)
}

export async function fetchStandings(leagueId: string): Promise<RawStandings> {
  const json = await getJson(
    `${FXEA}/getStandings?leagueId=${leagueId}`,
    'getStandings',
    LIVE_TTL,
  )
  return StandingsSchema.parse(json)
}

/** Returns every gameweek's matchup scores in a single request. */
export async function fetchSchedule(leagueId: string): Promise<RawScheduleResponse> {
  const res = await fetch(`${FXPA}?leagueId=${leagueId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgs: [{ method: 'getStandings', data: { leagueId, view: 'SCHEDULE' } }],
    }),
    next: { revalidate: LIVE_TTL },
  })
  if (!res.ok) throw new FantraxError('fxpa getStandings', `HTTP ${res.status}`)
  return ScheduleResponseSchema.parse(await res.json())
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/fantrax/
git commit -m "Add Zod schemas and Fantrax HTTP client"
```

---

### Task 4: Adapt league info into teams, periods and settings

**Files:**
- Create: `lib/adapt/leagueInfo.ts`
- Create test: `lib/adapt/leagueInfo.test.ts`

**Interfaces:**
- Consumes: `RawLeagueInfo` from Task 3; `Team`, `Period` from Task 2
- Produces: `adaptLeagueInfo(raw: RawLeagueInfo): { leagueName: string; seasonYear: number; teams: Team[]; periods: Period[]; regularSeasonPeriods: number; totalPeriods: number }`

Team `shortName` and `logoUrl` are not available from `getLeagueInfo`; they come from the schedule response's `fantasyTeamInfo` and are merged in Task 6. This adapter sets them to `null`.

- [ ] **Step 1: Write the failing test**

Create `lib/adapt/leagueInfo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema } from '@/lib/fantrax/schemas'
import { adaptLeagueInfo } from '@/lib/adapt/leagueInfo'

const raw2026 = LeagueInfoSchema.parse(
  JSON.parse(readFileSync('test/fixtures/2026/getLeagueInfo.json', 'utf8')),
)

describe('adaptLeagueInfo', () => {
  it('extracts league identity and structure', () => {
    const r = adaptLeagueInfo(raw2026)
    expect(r.leagueName).toBe('170 Broskis')
    expect(r.seasonYear).toBe(2026)
    expect(r.regularSeasonPeriods).toBe(35)
    expect(r.totalPeriods).toBe(38)
  })

  it('extracts all 14 teams with stable ids', () => {
    const r = adaptLeagueInfo(raw2026)
    expect(r.teams).toHaveLength(14)
    const names = r.teams.map((t) => t.name)
    expect(names).toContain('The Füllkrug Express')
    expect(names).toContain('Leibbi davíðs')
    // ids must be non-empty and unique
    const ids = new Set(r.teams.map((t) => t.teamId))
    expect(ids.size).toBe(14)
  })

  it('sorts teams by name so output ordering is deterministic', () => {
    const r = adaptLeagueInfo(raw2026)
    const names = r.teams.map((t) => t.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('extracts all 38 periods in ascending order', () => {
    const r = adaptLeagueInfo(raw2026)
    expect(r.periods).toHaveLength(38)
    expect(r.periods[0].number).toBe(1)
    expect(r.periods[37].number).toBe(38)
    expect(r.periods[0].startDate).toContain('2026-08-21')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/adapt/leagueInfo.test.ts`
Expected: FAIL — cannot resolve `@/lib/adapt/leagueInfo`.

- [ ] **Step 3: Create `lib/adapt/leagueInfo.ts`**

```ts
import type { RawLeagueInfo } from '@/lib/fantrax/schemas'
import type { Period, Team } from '@/lib/domain/types'

export interface AdaptedLeagueInfo {
  leagueName: string
  seasonYear: number
  teams: Team[]
  periods: Period[]
  regularSeasonPeriods: number
  totalPeriods: number
}

export function adaptLeagueInfo(raw: RawLeagueInfo): AdaptedLeagueInfo {
  const teams: Team[] = Object.values(raw.teamInfo)
    .map((t) => ({
      teamId: t.id,
      name: t.name,
      shortName: null,
      logoUrl: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const periods: Period[] = [...raw.scoringPeriods]
    .sort((a, b) => a.number - b.number)
    .map((p) => ({ number: p.number, startDate: p.startDate, endDate: p.endDate }))

  return {
    leagueName: raw.leagueName,
    seasonYear: raw.seasonYear,
    teams,
    periods,
    regularSeasonPeriods: raw.playoffs.lastRegularSeasonPeriod,
    totalPeriods: periods.length,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test lib/adapt/leagueInfo.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/adapt/leagueInfo.ts lib/adapt/leagueInfo.test.ts
git commit -m "Adapt league info into teams, periods and settings"
```

---

### Task 5: Adapt the schedule into fixtures and average fixtures

This is the highest-risk parsing in the project. Every stat depends on it.

**Files:**
- Create: `lib/adapt/schedule.ts`
- Create test: `lib/adapt/schedule.test.ts`

**Interfaces:**
- Consumes: `RawScheduleResponse` from Task 3; `Fixture`, `AverageFixture` from Task 2
- Produces:
  - `adaptSchedule(raw: RawScheduleResponse): { fixtures: Fixture[]; averageFixtures: AverageFixture[]; teamMeta: Map<TeamId, { shortName: string | null; logoUrl: string | null }> }`
  - `parseScore(content: string): number | null` (exported for testing)

Rules this adapter must enforce:
- A row is a **real fixture** when both team cells (index 0 and 2) have a `teamId`.
- A row is an **average fixture** when cell 0 has a `teamId` and cell 2 does not.
- Period number comes from parsing the table `caption`, e.g. `"Gameweek 12"` → `12`.
- An empty or non-numeric score string becomes `null`, never `0`.

- [ ] **Step 1: Write the failing test**

Create `lib/adapt/schedule.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { adaptSchedule, parseScore } from '@/lib/adapt/schedule'

const raw = ScheduleResponseSchema.parse(
  JSON.parse(readFileSync('test/fixtures/2025/fxpa-getStandings-schedule.json', 'utf8')),
)

describe('parseScore', () => {
  it('parses decimal scores', () => {
    expect(parseScore('55.75')).toBe(55.75)
    expect(parseScore('0')).toBe(0)
  })

  it('returns null for blank or unparseable content', () => {
    expect(parseScore('')).toBeNull()
    expect(parseScore('-')).toBeNull()
    expect(parseScore('n/a')).toBeNull()
  })
})

describe('adaptSchedule', () => {
  const r = adaptSchedule(raw)

  it('separates real fixtures from league-average fixtures', () => {
    // 10-team league, 35 gameweeks: 5 real + 10 average per gameweek
    expect(r.fixtures).toHaveLength(5 * 35)
    expect(r.averageFixtures).toHaveLength(10 * 35)
  })

  it('never treats *League Average* as a real team', () => {
    const ids = new Set(r.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]))
    expect(ids.size).toBe(10)
    for (const id of ids) expect(id).not.toBe('')
  })

  it('parses gameweek 1 scores exactly as Fantrax reports them', () => {
    const gw1 = r.fixtures.filter((f) => f.period === 1)
    expect(gw1).toHaveLength(5)
    const scores = gw1.flatMap((f) => [f.awayScore, f.homeScore])
    expect(scores).toContain(55.75)
    expect(scores).toContain(97.5)
    expect(scores).toContain(129.75)
  })

  it('records the league average for gameweek 1 as 101.15', () => {
    const avg = r.averageFixtures.filter((f) => f.period === 1)
    expect(avg).toHaveLength(10)
    for (const a of avg) expect(a.averageScore).toBe(101.15)
  })

  it('confirms the league average is the exact mean of team scores', () => {
    const gw1 = r.averageFixtures.filter((f) => f.period === 1)
    const mean = gw1.reduce((s, a) => s + (a.teamScore ?? 0), 0) / gw1.length
    expect(mean).toBeCloseTo(101.15, 6)
  })

  it('gives every team exactly one average fixture per gameweek', () => {
    for (let p = 1; p <= 35; p++) {
      const ids = r.averageFixtures.filter((f) => f.period === p).map((f) => f.teamId)
      expect(new Set(ids).size).toBe(10)
    }
  })

  it('gives every team exactly one real fixture per gameweek', () => {
    for (let p = 1; p <= 35; p++) {
      const ids = r.fixtures
        .filter((f) => f.period === p)
        .flatMap((f) => [f.homeTeamId, f.awayTeamId])
      expect(new Set(ids).size).toBe(10)
    }
  })

  it('extracts team display metadata including logos', () => {
    expect(r.teamMeta.size).toBe(10)
    const anyMeta = [...r.teamMeta.values()]
    expect(anyMeta.some((m) => m.logoUrl?.startsWith('https://'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/adapt/schedule.test.ts`
Expected: FAIL — cannot resolve `@/lib/adapt/schedule`.

- [ ] **Step 3: Create `lib/adapt/schedule.ts`**

```ts
import type { RawScheduleResponse } from '@/lib/fantrax/schemas'
import type { AverageFixture, Fixture, TeamId } from '@/lib/domain/types'

export interface TeamMeta {
  shortName: string | null
  logoUrl: string | null
}

export interface AdaptedSchedule {
  fixtures: Fixture[]
  averageFixtures: AverageFixture[]
  teamMeta: Map<TeamId, TeamMeta>
}

/** Fantrax sends scores as strings. Blank and placeholder values are not zero. */
export function parseScore(content: string): number | null {
  const trimmed = content.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function parsePeriod(caption: string): number | null {
  const m = caption.match(/(\d+)/)
  return m ? Number(m[1]) : null
}

export function adaptSchedule(raw: RawScheduleResponse): AdaptedSchedule {
  const data = raw.responses[0].data
  const fixtures: Fixture[] = []
  const averageFixtures: AverageFixture[] = []

  for (const table of data.tableList) {
    const period = parsePeriod(table.caption)
    if (period === null) continue

    for (const row of table.rows) {
      const [awayCell, awayScoreCell, homeCell, homeScoreCell] = row.cells
      if (!awayCell || !homeCell || !awayScoreCell || !homeScoreCell) continue

      // The away side is always a real team. A missing teamId on the home
      // side means this is the team's fixture against *League Average*.
      if (!awayCell.teamId) continue

      if (homeCell.teamId) {
        fixtures.push({
          period,
          awayTeamId: awayCell.teamId,
          homeTeamId: homeCell.teamId,
          awayScore: parseScore(awayScoreCell.content),
          homeScore: parseScore(homeScoreCell.content),
        })
      } else {
        averageFixtures.push({
          period,
          teamId: awayCell.teamId,
          teamScore: parseScore(awayScoreCell.content),
          averageScore: parseScore(homeScoreCell.content),
        })
      }
    }
  }

  const teamMeta = new Map<TeamId, TeamMeta>()
  for (const [teamId, info] of Object.entries(data.fantasyTeamInfo)) {
    teamMeta.set(teamId, {
      shortName: info.shortName ?? null,
      logoUrl: info.logoUrl512 ?? null,
    })
  }

  return { fixtures, averageFixtures, teamMeta }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test lib/adapt/schedule.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/adapt/schedule.ts lib/adapt/schedule.test.ts
git commit -m "Adapt schedule into real and league-average fixtures"
```

---

### Task 6: Compose SeasonData and add derived helpers

**Files:**
- Create: `lib/adapt/season.ts`, `lib/domain/season.ts`
- Create test: `lib/adapt/season.test.ts`, `lib/domain/season.test.ts`

**Interfaces:**
- Consumes: `adaptLeagueInfo` (Task 4), `adaptSchedule` (Task 5), `SeasonData` (Task 2)
- Produces:
  - `buildSeasonData(rawInfo: RawLeagueInfo, rawSchedule: RawScheduleResponse, leagueId: string): SeasonData`
    — `leagueId` must be passed in: `getLeagueInfo` returns `leagueHistoryId` (stable
    across all seasons) but not the per-season league ID. Conflating the two would give
    every season the same identifier.
  - `scoresForPeriod(season: SeasonData, period: number): Map<TeamId, number>`
  - `isPeriodComplete(season: SeasonData, period: number, now: Date): boolean`
  - `completedRegularPeriods(season: SeasonData, now: Date): number[]`

- [ ] **Step 1: Write the failing test for composition**

Create `lib/adapt/season.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'

const info = LeagueInfoSchema.parse(
  JSON.parse(readFileSync('test/fixtures/2025/getLeagueInfo.json', 'utf8')),
)
const schedule = ScheduleResponseSchema.parse(
  JSON.parse(readFileSync('test/fixtures/2025/fxpa-getStandings-schedule.json', 'utf8')),
)

describe('buildSeasonData', () => {
  const season = buildSeasonData(info, schedule, '7he4pkgpme8uz58b')

  it('composes a complete 2025 season', () => {
    expect(season.seasonYear).toBe(2025)
    expect(season.leagueId).toBe('7he4pkgpme8uz58b')
    expect(season.leagueName).toBe('170 Broskis')
    expect(season.teams).toHaveLength(10)
    expect(season.regularSeasonPeriods).toBe(35)
    expect(season.fixtures).toHaveLength(175)
    expect(season.averageFixtures).toHaveLength(350)
  })

  it('merges logo and short name metadata onto teams', () => {
    expect(season.teams.every((t) => t.logoUrl !== null)).toBe(true)
  })

  it('references only known team ids in fixtures', () => {
    const known = new Set(season.teams.map((t) => t.teamId))
    for (const f of season.fixtures) {
      expect(known.has(f.homeTeamId)).toBe(true)
      expect(known.has(f.awayTeamId)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/adapt/season.test.ts`
Expected: FAIL — cannot resolve `@/lib/adapt/season`.

- [ ] **Step 3: Create `lib/adapt/season.ts`**

```ts
import type { RawLeagueInfo, RawScheduleResponse } from '@/lib/fantrax/schemas'
import type { SeasonData } from '@/lib/domain/types'
import { adaptLeagueInfo } from './leagueInfo'
import { adaptSchedule } from './schedule'

export function buildSeasonData(
  rawInfo: RawLeagueInfo,
  rawSchedule: RawScheduleResponse,
  leagueId: string,
): SeasonData {
  const info = adaptLeagueInfo(rawInfo)
  const schedule = adaptSchedule(rawSchedule)

  const teams = info.teams.map((t) => {
    const meta = schedule.teamMeta.get(t.teamId)
    return { ...t, shortName: meta?.shortName ?? null, logoUrl: meta?.logoUrl ?? null }
  })

  return {
    seasonYear: info.seasonYear,
    leagueId,
    leagueName: info.leagueName,
    regularSeasonPeriods: info.regularSeasonPeriods,
    totalPeriods: info.totalPeriods,
    teams,
    periods: info.periods,
    fixtures: schedule.fixtures,
    averageFixtures: schedule.averageFixtures,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test lib/adapt/season.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing test for derived helpers**

Create `lib/domain/season.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import {
  scoresForPeriod,
  isPeriodComplete,
  completedRegularPeriods,
} from '@/lib/domain/season'

const season = buildSeasonData(
  LeagueInfoSchema.parse(
    JSON.parse(readFileSync('test/fixtures/2025/getLeagueInfo.json', 'utf8')),
  ),
  ScheduleResponseSchema.parse(
    JSON.parse(readFileSync('test/fixtures/2025/fxpa-getStandings-schedule.json', 'utf8')),
  ),
  '7he4pkgpme8uz58b',
)

describe('scoresForPeriod', () => {
  it('returns one score per team', () => {
    const scores = scoresForPeriod(season, 1)
    expect(scores.size).toBe(10)
  })

  it('returns the real reported scores for gameweek 1', () => {
    const values = [...scoresForPeriod(season, 1).values()].sort((a, b) => a - b)
    expect(values[0]).toBe(55.75)
    expect(values[values.length - 1]).toBe(143)
  })

  it('returns an empty map for a period with no fixtures', () => {
    expect(scoresForPeriod(season, 99).size).toBe(0)
  })
})

describe("Fantrax's date format", () => {
  it('parses, despite not being standard ISO 8601', () => {
    // Fantrax sends '2025-08-22T14:59:59.0-0400': a single-digit fractional
    // second and an offset with no colon. V8 accepts this, but the format is
    // outside the spec, so assert it explicitly rather than letting engine
    // leniency hide a future break.
    const raw = season.periods[0].endDate
    expect(raw).toBe('2025-08-22T14:59:59.0-0400')
    expect(Number.isNaN(new Date(raw).getTime())).toBe(false)
  })
})

describe('isPeriodComplete', () => {
  it('is true once the period end date has passed', () => {
    expect(isPeriodComplete(season, 1, new Date('2026-01-01'))).toBe(true)
  })

  it('is false before the period has ended', () => {
    expect(isPeriodComplete(season, 1, new Date('2025-08-16'))).toBe(false)
  })

  it('is false for an unknown period', () => {
    expect(isPeriodComplete(season, 99, new Date('2030-01-01'))).toBe(false)
  })
})

describe('completedRegularPeriods', () => {
  it('returns all 35 regular-season gameweeks for a finished season', () => {
    const done = completedRegularPeriods(season, new Date('2026-08-20'))
    expect(done).toHaveLength(35)
    expect(done[0]).toBe(1)
    expect(done[34]).toBe(35)
  })

  it('excludes playoff periods even when they are complete', () => {
    const done = completedRegularPeriods(season, new Date('2030-01-01'))
    expect(done).toHaveLength(35)
    expect(done).not.toContain(36)
  })

  it('returns nothing before the season starts', () => {
    expect(completedRegularPeriods(season, new Date('2025-08-01'))).toEqual([])
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test lib/domain/season.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/season`.

- [ ] **Step 7: Create `lib/domain/season.ts`**

```ts
import type { SeasonData, TeamId } from './types'

/**
 * Every team's score in a gameweek, taken from real fixtures where each
 * team appears exactly once. Teams whose score has not been reported yet
 * are omitted rather than recorded as zero.
 */
export function scoresForPeriod(season: SeasonData, period: number): Map<TeamId, number> {
  const scores = new Map<TeamId, number>()
  for (const f of season.fixtures) {
    if (f.period !== period) continue
    if (f.homeScore !== null) scores.set(f.homeTeamId, f.homeScore)
    if (f.awayScore !== null) scores.set(f.awayTeamId, f.awayScore)
  }
  return scores
}

export function isPeriodComplete(
  season: SeasonData,
  period: number,
  now: Date,
): boolean {
  const p = season.periods.find((x) => x.number === period)
  if (!p) return false
  const end = new Date(p.endDate)
  if (Number.isNaN(end.getTime())) return false
  return end.getTime() < now.getTime()
}

/** Completed gameweeks within the regular season, ascending. */
export function completedRegularPeriods(season: SeasonData, now: Date): number[] {
  const out: number[] = []
  for (let p = 1; p <= season.regularSeasonPeriods; p++) {
    if (isPeriodComplete(season, p, now)) out.push(p)
  }
  return out
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test lib/domain/season.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 9: Commit**

```bash
git add lib/adapt/season.ts lib/adapt/season.test.ts lib/domain/season.ts lib/domain/season.test.ts
git commit -m "Compose SeasonData and add derived period helpers"
```

---

### Task 7: The prize ledger

Money is displayed here, so this task carries the heaviest test coverage in the project. The expected values below are derived from the real 2025 season and are fixed.

**Files:**
- Create: `lib/stats/ledger.ts`
- Create test: `lib/stats/ledger.test.ts`

**Interfaces:**
- Consumes: `SeasonData` (Task 2), `scoresForPeriod` / `completedRegularPeriods` (Task 6)
- Produces:
  - `const PRIZE_PER_GAMEWEEK = 1500`
  - `interface GameweekPrize { period: number; topScore: number; winners: TeamId[]; iskPerWinner: number }`
  - `interface LedgerEntry { teamId: TeamId; gameweekWins: number; isk: number }`
  - `interface Ledger { prizePerGameweek: number; gameweeks: GameweekPrize[]; entries: LedgerEntry[]; totalPaid: number; gameweeksCounted: number }`
  - `computeLedger(season: SeasonData, now: Date, prizePerGameweek?: number): Ledger`

- [ ] **Step 1: Write the failing test**

Create `lib/stats/ledger.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import { computeLedger, PRIZE_PER_GAMEWEEK } from '@/lib/stats/ledger'
import type { SeasonData } from '@/lib/domain/types'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

const AFTER_SEASON = new Date('2026-08-20')
const nameOf = (s: SeasonData, id: string) => s.teams.find((t) => t.teamId === id)!.name

describe('computeLedger, 2025 season', () => {
  const ledger = computeLedger(season2025, AFTER_SEASON)

  it('counts all 35 regular-season gameweeks', () => {
    expect(ledger.gameweeksCounted).toBe(35)
    expect(ledger.gameweeks).toHaveLength(35)
  })

  it('pays out exactly the fixed pool of 52,500 ISK', () => {
    expect(ledger.totalPaid).toBeCloseTo(35 * PRIZE_PER_GAMEWEEK, 6)
    expect(ledger.totalPaid).toBeCloseTo(52500, 6)
  })

  it('entry ISK sums to the total paid', () => {
    const sum = ledger.entries.reduce((s, e) => s + e.isk, 0)
    expect(sum).toBeCloseTo(ledger.totalPaid, 6)
  })

  it('ranks The Füllkrug Express top on 8 wins and 12,000 ISK', () => {
    const top = ledger.entries[0]
    expect(nameOf(season2025, top.teamId)).toBe('The Füllkrug Express')
    expect(top.gameweekWins).toBe(8)
    expect(top.isk).toBeCloseTo(12000, 6)
  })

  it('splits the gameweek 16 tie 750/750', () => {
    const gw16 = ledger.gameweeks.find((g) => g.period === 16)!
    expect(gw16.winners).toHaveLength(2)
    expect(gw16.topScore).toBe(114.25)
    expect(gw16.iskPerWinner).toBeCloseTo(750, 6)
    const names = gw16.winners.map((id) => nameOf(season2025, id)).sort()
    expect(names).toEqual(['Haaland, Sakalegur markaskorari', 'Proof the Curse lives once more'])
  })

  it('counts a shared win as one win but pays half', () => {
    const haaland = ledger.entries.find(
      (e) => nameOf(season2025, e.teamId) === 'Haaland, Sakalegur markaskorari',
    )!
    expect(haaland.gameweekWins).toBe(5)
    expect(haaland.isk).toBeCloseTo(6750, 6)
  })

  it('gives every team at least one gameweek win', () => {
    expect(ledger.entries).toHaveLength(10)
    expect(ledger.entries.every((e) => e.gameweekWins >= 1)).toBe(true)
  })

  it('sorts entries by ISK descending', () => {
    const isks = ledger.entries.map((e) => e.isk)
    expect(isks).toEqual([...isks].sort((a, b) => b - a))
  })

  it('never awards a prize to the league-average pseudo-team', () => {
    const known = new Set(season2025.teams.map((t) => t.teamId))
    for (const g of ledger.gameweeks) {
      for (const w of g.winners) expect(known.has(w)).toBe(true)
    }
  })
})

describe('computeLedger, incomplete and empty seasons', () => {
  it('counts nothing before the season starts', () => {
    const ledger = computeLedger(season2025, new Date('2025-08-01'))
    expect(ledger.gameweeksCounted).toBe(0)
    expect(ledger.gameweeks).toEqual([])
    expect(ledger.totalPaid).toBe(0)
    expect(ledger.entries).toEqual([])
  })

  it('counts only gameweeks that have finished', () => {
    // Verified against the fixture: period 1 ends 2025-08-22, period 2 ends
    // 2025-08-29, and period 3 not until 2025-09-12 (international break).
    // So on 2025-08-30 exactly two gameweeks are complete.
    const ledger = computeLedger(season2025, new Date('2025-08-30'))
    expect(ledger.gameweeksCounted).toBe(2)
    expect(ledger.gameweeks.map((g) => g.period)).toEqual([1, 2])
    expect(ledger.totalPaid).toBeCloseTo(2 * PRIZE_PER_GAMEWEEK, 6)
  })

  it('excludes playoff gameweeks from the pool', () => {
    const ledger = computeLedger(season2025, new Date('2030-01-01'))
    expect(ledger.gameweeksCounted).toBe(35)
    expect(ledger.gameweeks.some((g) => g.period > 35)).toBe(false)
  })

  it('honours a custom prize amount', () => {
    const ledger = computeLedger(season2025, AFTER_SEASON, 100)
    expect(ledger.totalPaid).toBeCloseTo(3500, 6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/stats/ledger.test.ts`
Expected: FAIL — cannot resolve `@/lib/stats/ledger`.

- [ ] **Step 3: Create `lib/stats/ledger.ts`**

```ts
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { completedRegularPeriods, scoresForPeriod } from '@/lib/domain/season'

/** ISK awarded to the highest-scoring team each gameweek. New for the 2026 season. */
export const PRIZE_PER_GAMEWEEK = 1500

export interface GameweekPrize {
  period: number
  topScore: number
  /** More than one entry means a tie; the prize is split evenly. */
  winners: TeamId[]
  iskPerWinner: number
}

export interface LedgerEntry {
  teamId: TeamId
  /** A shared win counts as one win, even though it pays a fraction. */
  gameweekWins: number
  isk: number
}

export interface Ledger {
  prizePerGameweek: number
  gameweeks: GameweekPrize[]
  entries: LedgerEntry[]
  totalPaid: number
  gameweeksCounted: number
}

/**
 * The gameweek prize ledger.
 *
 * Only completed regular-season gameweeks count. The *League Average*
 * pseudo-team is structurally absent from `scoresForPeriod`, so it can
 * never win. Ties split the prize evenly.
 */
export function computeLedger(
  season: SeasonData,
  now: Date,
  prizePerGameweek: number = PRIZE_PER_GAMEWEEK,
): Ledger {
  const periods = completedRegularPeriods(season, now)
  const gameweeks: GameweekPrize[] = []

  for (const period of periods) {
    const scores = scoresForPeriod(season, period)
    if (scores.size === 0) continue

    const topScore = Math.max(...scores.values())
    const winners = [...scores.entries()]
      .filter(([, v]) => v === topScore)
      .map(([id]) => id)

    gameweeks.push({
      period,
      topScore,
      winners,
      iskPerWinner: prizePerGameweek / winners.length,
    })
  }

  const byTeam = new Map<TeamId, LedgerEntry>()
  for (const gw of gameweeks) {
    for (const teamId of gw.winners) {
      const entry = byTeam.get(teamId) ?? { teamId, gameweekWins: 0, isk: 0 }
      entry.gameweekWins += 1
      entry.isk += gw.iskPerWinner
      byTeam.set(teamId, entry)
    }
  }

  const entries = [...byTeam.values()].sort(
    (a, b) => b.isk - a.isk || b.gameweekWins - a.gameweekWins,
  )

  return {
    prizePerGameweek,
    gameweeks,
    entries,
    totalPaid: gameweeks.reduce((s, g) => s + g.iskPerWinner * g.winners.length, 0),
    gameweeksCounted: gameweeks.length,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test lib/stats/ledger.test.ts`
Expected: PASS, 13 tests. If the 52,500 assertion fails, stop and fix — every other stat can be wrong and nobody notices, but this one is money.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/stats/ledger.ts lib/stats/ledger.test.ts
git commit -m "Add gameweek prize ledger with tie splitting"
```

---

### Task 8: Cached season loading

**Files:**
- Create: `lib/season/load.ts`
- Modify: `config/leagues.ts` (add `PRIZE_RULE_FROM_SEASON`)
- Create test: `lib/season/load.test.ts`

**Interfaces:**
- Consumes: `fetchLeagueInfo` / `fetchSchedule` (Task 3), `buildSeasonData` (Task 6), `LEAGUES` (Task 2)
- Produces:
  - `loadSeason(year: number): Promise<SeasonData>`
  - `prizeRuleApplies(year: number): boolean`
  - `const PRIZE_RULE_FROM_SEASON = 2026`

`loadSeason` is the only function in the project that performs I/O. Caching is delegated to `fetch`'s `next.revalidate` options set in Task 3, so this file stays free of caching logic.

- [ ] **Step 1: Write the failing test**

Create `lib/season/load.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prizeRuleApplies } from '@/lib/season/load'

describe('prizeRuleApplies', () => {
  it('applies from 2026 onward', () => {
    expect(prizeRuleApplies(2026)).toBe(true)
    expect(prizeRuleApplies(2027)).toBe(true)
  })

  it('does not apply to 2025, where the rule did not exist', () => {
    expect(prizeRuleApplies(2025)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/season/load.test.ts`
Expected: FAIL — cannot resolve `@/lib/season/load`.

- [ ] **Step 3: Add the constant to `config/leagues.ts`**

Append:

```ts
/**
 * The 1500 ISK gameweek prize is new for the 2026 season. Earlier seasons
 * are computed for display only and must be labelled hypothetical.
 */
export const PRIZE_RULE_FROM_SEASON = 2026
```

- [ ] **Step 4: Create `lib/season/load.ts`**

```ts
import { LEAGUES, PRIZE_RULE_FROM_SEASON } from '@/config/leagues'
import { fetchLeagueInfo, fetchSchedule } from '@/lib/fantrax/client'
import { buildSeasonData } from '@/lib/adapt/season'
import type { SeasonData } from '@/lib/domain/types'

/**
 * Whether the gameweek prize was a real league rule in this season.
 * When false, the ledger is hypothetical and must be labelled as such.
 */
export function prizeRuleApplies(year: number): boolean {
  return year >= PRIZE_RULE_FROM_SEASON
}

export async function loadSeason(year: number): Promise<SeasonData> {
  const leagueId = LEAGUES[year]
  if (!leagueId) throw new Error(`No league configured for season ${year}`)

  const [info, schedule] = await Promise.all([
    fetchLeagueInfo(leagueId),
    fetchSchedule(leagueId),
  ])
  return buildSeasonData(info, schedule, leagueId)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test lib/season/load.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Verify both leagues are still publicly readable**

```bash
curl -s -o /dev/null -w "2026 getLeagueInfo: %{http_code}\n" "https://www.fantrax.com/fxea/general/getLeagueInfo?leagueId=ywhebyp7msyix1sj"
curl -s -o /dev/null -w "2025 getLeagueInfo: %{http_code}\n" "https://www.fantrax.com/fxea/general/getLeagueInfo?leagueId=7he4pkgpme8uz58b"
```

Expected: both `200`. A `403` or `401` means public view was switched off — stop and tell the user.

- [ ] **Step 7: Commit**

```bash
git add lib/season/load.ts lib/season/load.test.ts config/leagues.ts
git commit -m "Add cached season loading and prize-rule gating"
```

---

### Task 9: The ledger page

**Files:**
- Create: `app/components/LedgerTable.tsx`
- Create: `app/components/GameweekHistory.tsx`
- Modify: `app/page.tsx` (replace the create-next-app placeholder entirely)
- Modify: `app/layout.tsx` (set the page title)

**Interfaces:**
- Consumes: `loadSeason` / `prizeRuleApplies` (Task 8), `computeLedger` (Task 7), `SeasonData` (Task 2)
- Produces: a rendered page at `/`

There is no unit test here; correctness lives in the stat functions. Verification is visual.

- [ ] **Step 1: Create `app/components/LedgerTable.tsx`**

```tsx
import type { Ledger } from '@/lib/stats/ledger'
import type { SeasonData } from '@/lib/domain/types'

const isk = new Intl.NumberFormat('is-IS', { maximumFractionDigits: 0 })

export function LedgerTable({
  season,
  ledger,
  hypothetical,
}: {
  season: SeasonData
  ledger: Ledger
  hypothetical: boolean
}) {
  const teamName = (id: string) =>
    season.teams.find((t) => t.teamId === id)?.name ?? id
  const teamLogo = (id: string) =>
    season.teams.find((t) => t.teamId === id)?.logoUrl ?? null

  if (ledger.gameweeksCounted === 0) {
    return (
      <p className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-neutral-400">
        No gameweeks have finished yet. The ledger fills in from gameweek 1.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {hypothetical && (
        <div className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-200">
          <strong className="font-semibold">Hypothetical.</strong> The gameweek prize did
          not exist in {season.seasonYear}. These figures show what the rule{' '}
          <em>would</em> have paid. No money was or will be paid out for this season.
        </div>
      )}

      <table className="w-full border-collapse text-sm">
        <caption className="pb-3 text-left text-neutral-400">
          {ledger.gameweeksCounted} of {season.regularSeasonPeriods} gameweeks counted
          &middot; {isk.format(ledger.totalPaid)} ISK total
        </caption>
        <thead>
          <tr className="border-b border-neutral-700 text-left text-neutral-400">
            <th className="py-2 pr-2 font-medium">#</th>
            <th className="py-2 pr-2 font-medium">Team</th>
            <th className="py-2 pr-2 text-right font-medium">GW wins</th>
            <th className="py-2 text-right font-medium">ISK</th>
          </tr>
        </thead>
        <tbody>
          {ledger.entries.map((e, i) => (
            <tr key={e.teamId} className="border-b border-neutral-800/60">
              <td className="py-2 pr-2 text-neutral-500">{i + 1}</td>
              <td className="py-2 pr-2">
                <span className="flex items-center gap-2">
                  {teamLogo(e.teamId) && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={teamLogo(e.teamId)!}
                      alt=""
                      className="h-5 w-5 rounded-sm object-cover"
                    />
                  )}
                  {teamName(e.teamId)}
                </span>
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{e.gameweekWins}</td>
              <td className="py-2 text-right font-medium tabular-nums">
                {isk.format(e.isk)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/components/GameweekHistory.tsx`**

The ledger table shows totals; this shows which gameweek each prize came from,
which is what makes it arguable in the group chat.

```tsx
import type { Ledger } from '@/lib/stats/ledger'
import type { SeasonData } from '@/lib/domain/types'

const isk = new Intl.NumberFormat('is-IS', { maximumFractionDigits: 0 })

export function GameweekHistory({
  season,
  ledger,
}: {
  season: SeasonData
  ledger: Ledger
}) {
  if (ledger.gameweeks.length === 0) return null

  const teamName = (id: string) =>
    season.teams.find((t) => t.teamId === id)?.name ?? id

  // Most recent gameweek first: the interesting one is the latest.
  const rows = [...ledger.gameweeks].reverse()

  return (
    <details className="mt-6 rounded-lg border border-neutral-800">
      <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-300">
        Gameweek by gameweek ({ledger.gameweeks.length})
      </summary>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-neutral-800 text-left text-neutral-400">
            <th className="py-2 pl-4 pr-2 font-medium">GW</th>
            <th className="py-2 pr-2 font-medium">Winner</th>
            <th className="py-2 pr-2 text-right font-medium">Score</th>
            <th className="py-2 pr-4 text-right font-medium">ISK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.period} className="border-b border-neutral-800/60">
              <td className="py-2 pl-4 pr-2 text-neutral-500 tabular-nums">{g.period}</td>
              <td className="py-2 pr-2">
                {g.winners.map((id) => teamName(id)).join(' & ')}
                {g.winners.length > 1 && (
                  <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                    tie, split
                  </span>
                )}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{g.topScore}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {isk.format(g.iskPerWinner)}
                {g.winners.length > 1 && ' ea'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
```

- [ ] **Step 3: Replace `app/page.tsx`**

```tsx
import { SEASON_YEARS } from '@/config/leagues'
import { loadSeason, prizeRuleApplies } from '@/lib/season/load'
import { computeLedger } from '@/lib/stats/ledger'
import { LedgerTable } from './components/LedgerTable'
import { GameweekHistory } from './components/GameweekHistory'

export default async function Page() {
  const now = new Date()
  const seasons = await Promise.all(
    SEASON_YEARS.map(async (year) => {
      const season = await loadSeason(year)
      return { year, season, ledger: computeLedger(season, now) }
    }),
  )

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">170 Broskis</h1>
      <p className="mt-1 text-neutral-400">
        Gameweek prize ledger &mdash; 1,500 ISK to the highest-scoring team each gameweek,
        ties split.
      </p>

      {seasons.map(({ year, season, ledger }) => (
        <section key={year} className="mt-10">
          <h2 className="mb-4 text-lg font-medium">{year}</h2>
          <LedgerTable
            season={season}
            ledger={ledger}
            hypothetical={!prizeRuleApplies(year)}
          />
          <GameweekHistory season={season} ledger={ledger} />
        </section>
      ))}
    </main>
  )
}
```

- [ ] **Step 4: Set the title in `app/layout.tsx`**

Replace the exported `metadata` object with:

```ts
export const metadata = {
  title: '170 Broskis',
  description: 'League stats for the 170 Broskis Fantrax Premier League draft league',
}
```

- [ ] **Step 5: Run the dev server and verify visually**

Run: `npm run dev`, open http://localhost:3000

Expected:
- A **2026** section showing the empty-state message, because no gameweek has finished yet
- A **2025** section showing the amber hypothetical banner, ten teams, The Füllkrug Express top on 8 wins and 12,000 ISK, and a caption reading `35 of 35 gameweeks counted · 52,500 ISK total`
- Team logos rendering beside names
- Expanding "Gameweek by gameweek" on 2025 lists 35 rows, newest first, with gameweek 16
  marked as a tie showing 750 ISK each

If 2025 totals anything other than 52,500, stop — Task 7's tests are passing but the page is wiring something wrong.

- [ ] **Step 6: Verify the production build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add app/
git commit -m "Add ledger page for both seasons"
```

---

## Verification

After Task 9, all of these must hold:

- [ ] `npm test` passes, roughly 49 tests across 8 files
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `npm run build` succeeds
- [ ] The 2025 ledger totals exactly 52,500 ISK
- [ ] The 2025 ledger is labelled hypothetical
- [ ] The 2026 ledger shows the empty state rather than a table of zeros
- [ ] No file contains a cookie, token, API key or `.env` reference

## Follow-on plans

1. **Luck vs. skill** — the real-vs-average record split, all-play, expected points, schedule swap, points against, close games, alternate-universe tables, average threshold tracker
2. **Rivalries** — cross-season H2H matrix, nemesis and bunny, revenge fixtures. Needs `config/managers.ts`, deferred to here because the ledger is per-season and does not need cross-season identity
3. **Records and superlatives** — extremes, streaks, form table, boom-or-bust, biggest collapse, power rankings, weekly awards
4. **Front-page hierarchy** — layout, so twenty stats do not arrive as twenty tables
