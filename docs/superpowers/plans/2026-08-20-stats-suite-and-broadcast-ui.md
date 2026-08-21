# Stats Suite and Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the money-path completeness guard, build the four stat families (luck, rivalries, records, power) as pure modules over `SeasonData`, then redesign the page as a light, phone-first editorial stats page with a real desktop layout.

**Amended 2026-08-21 — phase 4 only.** Tasks 0-13 are unchanged and may already be in progress; nothing below touches them. The original phase 4 specified a dark sports-broadcast treatment; that was reviewed and rejected on three counts (too dark, too dense on desktop, broadcast styling not wanted). The information design survives — crests, large numerals, award cards, form arrows, score-bat framing. The TV-graphics skin does not. Filenames keep their original slugs because git history and the companion spec reference them.

**Architecture:** Unchanged from the foundation. Every stat is a pure function in `lib/stats/` taking `SeasonData` (+ `now`) and returning plain data — no I/O, no wall-clock reads. All stat modules gate on a new shared `auditRegularPeriods` helper so every number on the page has money-grade trust in which gameweeks are real. The UI phase (tasks 14–19) works differently: stats first, then design against real numbers with visual iteration in a browser.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React, Tailwind CSS v4, Zod, Vitest.

## Global Constraints

- **No authentication anywhere.** No cookies, API keys, or `.env` secrets. If a task seems to need one, the task is wrong.
- **Normalization boundary:** nothing outside `lib/fantrax/` and `lib/adapt/` may reference a Fantrax field name, response shape, or magic string.
- **Purity in stats:** every `lib/stats/` function takes `now: Date` as a parameter and never reads wall-clock time.
- **Ledger regression values are fixed, never adjusted to match output:** exactly 35 gameweeks, exactly 52,500 ISK total, The Füllkrug Express 8 wins / 12,000 ISK, gameweek 16 a tie splitting 750/750.
- **No network calls in tests.** Tests read committed fixtures from `test/fixtures/`, which are irreplaceable captured responses. **Never modify fixture files.**
- Record semantics (verified against the final-standings fixture): a win is 1 win point, a draw 0.5. Tables rank by win points descending, tiebreak total points-for descending, then `teamId` ascending for determinism.
- Playoff spots: 2025 has **5** playoff teams (of 10), 2026 has **7** (of 14). Both from `playoffs.numPlayoffTeams` in `getLeagueInfo`.
- Each team plays two fixtures per gameweek: one real opponent, one vs `*League Average*`. League-average rows are identified structurally by the missing `teamId`, never by name.
- The prize rule is new for 2026; every 2025 ledger view says "hypothetical", unmissably.
- Node 20.11+. Port 3000 is taken by an unrelated nginx; `npm run dev` lands on **3001**.
- `npm test` currently passes 57 tests. It must pass (with additions) after every task.
- All expected values in test code below were computed from the committed 2025 fixtures with an independent script and cross-validated against the final-standings fixture (`test/fixtures/2025/getStandings.json`). If an implementation disagrees with an expected value, **the implementation is wrong** — debug it; do not adjust the expectation.

## File Structure

| File | Responsibility |
|---|---|
| `test/helpers/synthetic.ts` | Shared synthetic-season builder for states 2025 never produced. Test-only. |
| `lib/domain/season.ts` (modify) | Add `maxFixturesPerPeriod` + `auditRegularPeriods` — the single settled/withheld decision every stat trusts. |
| `lib/stats/ledger.ts` (modify) | Refactor onto `auditRegularPeriods`. Output unchanged. |
| `lib/domain/types.ts` (modify) | Add `playoffTeams` to `SeasonData`. |
| `lib/adapt/leagueInfo.ts` (modify) | Adapt `playoffs.numPlayoffTeams`. |
| `lib/stats/tables.ts` | `TeamRecord`, real/average/combined records, `rankTable`. Shared by everything below. |
| `lib/stats/luck.ts` | All-play, expected-vs-actual, schedule swap, points against, close games, average threshold. |
| `config/managers.ts` | Manual teamId → managerId overrides for cross-season identity. |
| `lib/stats/managers.ts` | `resolveManagers`: name-matched cross-season identity, overrides, unmatched surfaced. |
| `lib/stats/rivalries.ts` | Head-to-head matrix, nemesis/bunny, revenge fixtures. |
| `lib/stats/records.ts` | Extremes, streaks, form table, distributions, collapses, weekly awards. |
| `lib/stats/power.ts` | Power rankings with weekly movement. |
| `app/` (phase 4) | Page redesign: front page `/`, deep dive `/season/[year]`, components under `app/components/`. |

Note for the executor: the spec's "capture a 2026 fixture as soon as gameweek 1 settles" cannot be done in this plan — gameweek 1 of 2026 has not been played as of 2026-08-20. It stays in `docs/superpowers/follow-ups.md`.

---

## Phase 0 — Ledger hardening

### Task 1: Shared synthetic-season helper and `auditRegularPeriods`

**Files:**
- Create: `test/helpers/synthetic.ts`
- Modify: `lib/domain/season.ts`
- Test: `lib/domain/season.test.ts` (append)

**Interfaces:**
- Consumes: `SeasonData`, `completedRegularPeriods`, `scoresForPeriod` from `lib/domain/*` (existing).
- Produces:
  - `syntheticSeason(opts?: SyntheticSeasonOptions): SeasonData` and `SYNTHETIC_SEASON_OVER: Date` from `test/helpers/synthetic.ts`
  - `maxFixturesPerPeriod(season: SeasonData): number`
  - `interface PeriodAudit { settled: number[]; withheld: number[] }`
  - `auditRegularPeriods(season: SeasonData, now: Date): PeriodAudit`

This is the money-path fix from `docs/superpowers/follow-ups.md`: the ledger's completeness guard derives its expected score count from the same fixture rows `scoresForPeriod` reads, so a period whose rows were truncated during parsing (but whose surviving rows have complete scores) would pay out among the survivors. The fix compares a period's fixture count against the **maximum fixtures-per-period observed across the same schedule response** — self-consistent within one fetch, immune to cache skew, still catches truncation.

`auditRegularPeriods` becomes the single definition of "this gameweek's numbers are real" for the ledger **and** every stat module in later tasks.

- [ ] **Step 1: Create the synthetic-season helper**

Create `test/helpers/synthetic.ts` (the `.ts`-not-`.test.ts` name keeps it out of the Vitest `include` glob):

```ts
import type { AverageFixture, Fixture, Period, SeasonData, Team } from '@/lib/domain/types'

const DEFAULT_TEAMS: Team[] = [
  { teamId: 'A', name: 'Team A', shortName: null, logoUrl: null },
  { teamId: 'B', name: 'Team B', shortName: null, logoUrl: null },
  { teamId: 'C', name: 'Team C', shortName: null, logoUrl: null },
  { teamId: 'D', name: 'Team D', shortName: null, logoUrl: null },
]

export interface SyntheticSeasonOptions {
  seasonYear?: number
  teams?: Team[]
  periods?: Period[]
  fixtures?: Fixture[]
  averageFixtures?: AverageFixture[]
  regularSeasonPeriods?: number
}

/** All synthetic periods are complete by this date. */
export const SYNTHETIC_SEASON_OVER = new Date('2100-01-01')

/**
 * A minimal SeasonData for states the real 2025 fixture never produced.
 * Periods default to one week per period starting 2099-01-01, so every
 * period is in the past relative to SYNTHETIC_SEASON_OVER and in the
 * future relative to any real "now".
 */
export function syntheticSeason(opts: SyntheticSeasonOptions = {}): SeasonData {
  const fixtures = opts.fixtures ?? []
  const maxPeriod = Math.max(1, ...fixtures.map((f) => f.period))
  const regularSeasonPeriods = opts.regularSeasonPeriods ?? maxPeriod
  const periods =
    opts.periods ??
    Array.from({ length: maxPeriod }, (_, i) => ({
      number: i + 1,
      startDate: new Date(Date.UTC(2099, 0, 1 + i * 7)).toISOString(),
      endDate: new Date(Date.UTC(2099, 0, 8 + i * 7)).toISOString(),
    }))

  return {
    seasonYear: opts.seasonYear ?? 2099,
    leagueId: 'synthetic',
    leagueName: 'Synthetic League',
    regularSeasonPeriods,
    totalPeriods: periods.length,
    teams: opts.teams ?? DEFAULT_TEAMS,
    periods,
    fixtures,
    averageFixtures: opts.averageFixtures ?? [],
  }
}
```

- [ ] **Step 2: Write the failing tests**

Append to `lib/domain/season.test.ts`:

```ts
import { auditRegularPeriods, maxFixturesPerPeriod } from './season'
import { syntheticSeason, SYNTHETIC_SEASON_OVER } from '@/test/helpers/synthetic'

describe('auditRegularPeriods', () => {
  it('settles all 35 gameweeks of the complete 2025 season', () => {
    const audit = auditRegularPeriods(season, new Date('2026-08-20'))
    expect(audit.settled).toHaveLength(35)
    expect(audit.settled[0]).toBe(1)
    expect(audit.settled[34]).toBe(35)
    expect(audit.withheld).toEqual([])
  })

  it('withholds a period whose fixture rows were truncated during parsing', () => {
    // Period 1 has the full complement of 2 fixtures; period 2 lost a row
    // during parsing, but its surviving row carries complete scores. The
    // old per-period guard cannot see this; the max-fixtures guard can.
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 8, awayScore: 3 },
        { period: 2, homeTeamId: 'A', awayTeamId: 'B', homeScore: 12, awayScore: 7 },
      ],
    })
    const audit = auditRegularPeriods(season, SYNTHETIC_SEASON_OVER)
    expect(audit.settled).toEqual([1])
    expect(audit.withheld).toEqual([2])
  })

  it('withholds an all-zero period (unplayed gameweek posted as "0" scores)', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 0, awayScore: 0 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 0, awayScore: 0 },
      ],
    })
    const audit = auditRegularPeriods(season, SYNTHETIC_SEASON_OVER)
    expect(audit.settled).toEqual([])
    expect(audit.withheld).toEqual([1])
  })

  it('withholds a period with partial scores', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: null, awayScore: null },
      ],
    })
    const audit = auditRegularPeriods(season, SYNTHETIC_SEASON_OVER)
    expect(audit.settled).toEqual([])
    expect(audit.withheld).toEqual([1])
  })

  it('neither settles nor withholds periods that have not ended', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 8, awayScore: 3 },
      ],
    })
    const audit = auditRegularPeriods(season, new Date('2026-08-20'))
    expect(audit.settled).toEqual([])
    expect(audit.withheld).toEqual([])
  })
})

describe('maxFixturesPerPeriod', () => {
  it('is 5 for the 10-team 2025 season', () => {
    expect(maxFixturesPerPeriod(season)).toBe(5)
  })

  it('is 0 for a season with no fixtures', () => {
    expect(maxFixturesPerPeriod(syntheticSeason())).toBe(0)
  })
})
```

The existing file already builds the 2025 `SeasonData` as a constant named `season` — the snippets above use that name; do not redefine it.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/domain/season.test.ts`
Expected: FAIL — `auditRegularPeriods` is not exported.

- [ ] **Step 4: Implement in `lib/domain/season.ts`**

Append:

```ts
/**
 * The largest number of real fixtures any regular-season period carries.
 * Within one schedule response this is the expected fixture count for
 * every period; a period below it had rows truncated during parsing.
 */
export function maxFixturesPerPeriod(season: SeasonData): number {
  const counts = new Map<number, number>()
  for (const f of season.fixtures) {
    if (f.period > season.regularSeasonPeriods) continue
    counts.set(f.period, (counts.get(f.period) ?? 0) + 1)
  }
  return counts.size === 0 ? 0 : Math.max(...counts.values())
}

export interface PeriodAudit {
  /** Regular-season periods whose scores can be trusted completely. */
  settled: number[]
  /**
   * Periods whose end date has passed but whose scores failed a
   * completeness guard — awaiting final scores, truncated, or posted as
   * placeholder zeros. Distinct from "not yet played".
   */
  withheld: number[]
}

/**
 * The single trust decision for a gameweek's scores. Guards, in order:
 *
 * 1. The period's fixture count must equal the maximum observed across
 *    this same schedule response. Catches a period whose rows were
 *    truncated during parsing even when the surviving rows have complete
 *    scores. Self-consistent within one fetch, so immune to the
 *    cross-fetch cache skew that ruled out comparing to `teams.length`.
 * 2. Every team in the period must have reported a score. Fantrax posts
 *    an unplayed gameweek's score as the string "0", not blank, so a
 *    date-based check alone is not sufficient.
 * 3. The top score must be positive. An all-zero period is a Fantrax
 *    placeholder for an unplayed gameweek, never a real result.
 *
 * Guards 2 and 3 overlap but are NOT redundant — see AGENTS.md.
 */
export function auditRegularPeriods(season: SeasonData, now: Date): PeriodAudit {
  const settled: number[] = []
  const withheld: number[] = []
  const expectedFixtures = maxFixturesPerPeriod(season)

  for (const period of completedRegularPeriods(season, now)) {
    const fixtureCount = season.fixtures.filter((f) => f.period === period).length
    const scores = scoresForPeriod(season, period)
    const trusted =
      fixtureCount > 0 &&
      fixtureCount === expectedFixtures &&
      scores.size === 2 * fixtureCount &&
      Math.max(...scores.values()) > 0
    if (trusted) settled.push(period)
    else withheld.push(period)
  }
  return { settled, withheld }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/domain/season.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, 57 existing tests + the new ones. Nothing else changed.

- [ ] **Step 7: Commit**

```bash
git add test/helpers/synthetic.ts lib/domain/season.ts lib/domain/season.test.ts
git commit -m "Add auditRegularPeriods with truncation guard and shared synthetic-season helper"
```

---

### Task 2: Refactor the ledger onto `auditRegularPeriods`

**Files:**
- Modify: `lib/stats/ledger.ts`
- Modify test: `lib/stats/ledger.test.ts`

**Interfaces:**
- Consumes: `auditRegularPeriods` from Task 1.
- Produces: `computeLedger` signature and `Ledger` shape **unchanged**. Behaviour changes in exactly one case: a truncated period is now withheld.

The ledger is real money — this task moves its guards into the shared audit without changing any paid amount for either real season. Every fixed regression value must survive untouched.

- [ ] **Step 1: Write the failing test**

Append to `lib/stats/ledger.test.ts`:

```ts
describe('computeLedger, truncated fixture rows', () => {
  it('withholds a period whose fixture rows were truncated during parsing', () => {
    // Period 2 lost its C–D row during parsing; the surviving A–B row has
    // complete, non-zero scores. Without the max-fixtures guard the ledger
    // would pay period 2's prize to A among the survivors.
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 5 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 8, awayScore: 3 },
        { period: 2, homeTeamId: 'A', awayTeamId: 'B', homeScore: 12, awayScore: 7 },
      ],
    })
    const ledger = computeLedger(season, SYNTHETIC_SEASON_OVER)
    expect(ledger.gameweeksCounted).toBe(1)
    expect(ledger.gameweeks.map((g) => g.period)).toEqual([1])
    expect(ledger.periodsWithheld).toBe(1)
    expect(ledger.totalPaid).toBeCloseTo(PRIZE_PER_GAMEWEEK, 6)
  })
})
```

Also in this file: replace the local `buildSyntheticSeason` helper and its `AFTER_SYNTHETIC_PERIOD` constant with the shared helper —

```ts
import { syntheticSeason, SYNTHETIC_SEASON_OVER } from '@/test/helpers/synthetic'
```

Each existing `buildSyntheticSeason([...fixtures])` call becomes `syntheticSeason({ fixtures: [...] })`, and `AFTER_SYNTHETIC_PERIOD` becomes `SYNTHETIC_SEASON_OVER`. The cache-skew test at the bottom builds its `SeasonData` literal inline with a 5th team — convert it to `syntheticSeason({ teams: [...five teams...], fixtures: [...] })`, keeping its five-team list and both fixtures exactly as they are. Delete the now-unused local builder. Keep every existing assertion byte-identical.

- [ ] **Step 2: Run to verify the new test fails**

Run: `npx vitest run lib/stats/ledger.test.ts`
Expected: the new truncation test FAILS (`gameweeksCounted` is 2, `periodsWithheld` 0); all pre-existing assertions PASS.

- [ ] **Step 3: Refactor `computeLedger`**

In `lib/stats/ledger.ts`, replace the period loop with the audit. The imports change to:

```ts
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods, scoresForPeriod } from '@/lib/domain/season'
```

and the body of `computeLedger` becomes:

```ts
export function computeLedger(
  season: SeasonData,
  now: Date,
  prizePerGameweek: number = PRIZE_PER_GAMEWEEK,
): Ledger {
  // All completeness guards — full score set, no truncated fixture rows,
  // no all-zero placeholder periods — live in auditRegularPeriods, shared
  // with every stat module. Only settled periods pay.
  const { settled, withheld } = auditRegularPeriods(season, now)

  const gameweeks: GameweekPrize[] = settled.map((period) => {
    const scores = scoresForPeriod(season, period)
    const topScore = Math.max(...scores.values())
    const winners = [...scores.entries()]
      .filter(([, v]) => v === topScore)
      .map(([id]) => id)
    return { period, topScore, winners, iskPerWinner: prizePerGameweek / winners.length }
  })

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
    periodsWithheld: withheld.length,
  }
}
```

The `Ledger`/`GameweekPrize`/`LedgerEntry` interfaces and `PRIZE_PER_GAMEWEEK` stay exactly as they are.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. The 2025 regression values must be untouched: 35 gameweeks, 52,500 ISK, Füllkrug Express 8 wins / 12,000 ISK, gameweek 16 tie 750/750. If any of those fail, the refactor is wrong — do not touch the expectations.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/ledger.ts lib/stats/ledger.test.ts
git commit -m "Close ledger truncation blind spot via shared period audit"
```

---

## Phase 1 — Luck vs. skill

### Task 3: `playoffTeams` on `SeasonData`

**Files:**
- Modify: `lib/domain/types.ts`, `lib/adapt/leagueInfo.ts`, `lib/adapt/season.ts`, `test/helpers/synthetic.ts`
- Test: `lib/adapt/leagueInfo.test.ts` (append)

**Interfaces:**
- Consumes: `raw.playoffs.numPlayoffTeams`, already validated by `LeagueInfoSchema` (nothing to add in `lib/fantrax/`).
- Produces: `SeasonData.playoffTeams: number` and `AdaptedLeagueInfo.playoffTeams: number`. Task 6's schedule swap relies on it. `syntheticSeason` accepts `playoffTeams?: number`, defaulting to **2**.

- [ ] **Step 1: Write the failing tests**

Append to `lib/adapt/leagueInfo.test.ts`. The file already defines `raw2026` (the parsed 2026 `getLeagueInfo.json`); add a `raw2025` constant built the same way from `test/fixtures/2025/getLeagueInfo.json`, then:

```ts
it('adapts the playoff team count (2025: 5 of 10)', () => {
  expect(adaptLeagueInfo(raw2025).playoffTeams).toBe(5)
})

it('adapts the playoff team count (2026: 7 of 14)', () => {
  expect(adaptLeagueInfo(raw2026).playoffTeams).toBe(7)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/adapt/leagueInfo.test.ts`
Expected: FAIL — `playoffTeams` does not exist (TypeScript error or `undefined`).

- [ ] **Step 3: Implement**

In `lib/domain/types.ts`, add to `SeasonData` (after `regularSeasonPeriods`):

```ts
  /** Teams that make the playoffs: 5 of 10 in 2025, 7 of 14 in 2026. */
  playoffTeams: number
```

In `lib/adapt/leagueInfo.ts`, add `playoffTeams: number` to `AdaptedLeagueInfo` and `playoffTeams: raw.playoffs.numPlayoffTeams` to the returned object. In `lib/adapt/season.ts`, pass `playoffTeams: info.playoffTeams` through `buildSeasonData`. In `test/helpers/synthetic.ts`, add `playoffTeams?: number` to `SyntheticSeasonOptions` and `playoffTeams: opts.playoffTeams ?? 2` to the returned object.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (TypeScript strictness will have flagged any missed `SeasonData` literal — the compiler errors are the checklist).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/types.ts lib/adapt/leagueInfo.ts lib/adapt/season.ts lib/adapt/leagueInfo.test.ts test/helpers/synthetic.ts
git commit -m "Carry playoff team count into SeasonData"
```

---

### Task 4: Records and tables (`lib/stats/tables.ts`)

**Files:**
- Create: `lib/stats/tables.ts`
- Test: `lib/stats/tables.test.ts`

**Interfaces:**
- Consumes: `auditRegularPeriods` (Task 1).
- Produces (used by Tasks 5–7, 9, 11, 13 and the UI):
  - `interface TeamRecord { teamId: TeamId; wins: number; draws: number; losses: number; pointsFor: number; pointsAgainst: number; games: number }`
  - `winPoints(r: Pick<TeamRecord, 'wins' | 'draws'>): number` — wins + 0.5 × draws
  - `realRecords(season: SeasonData, now: Date): Map<TeamId, TeamRecord>` — real-opponent fixtures in settled periods only
  - `averageRecords(season: SeasonData, now: Date): Map<TeamId, TeamRecord>` — league-average fixtures in settled periods; `pointsAgainst` sums the league-average scores
  - `combinedRecords(season: SeasonData, now: Date): Map<TeamId, TeamRecord>` — element-wise sum of the two; this is the official Fantrax table
  - `rankTable(records: Map<TeamId, TeamRecord>): TeamRecord[]` — win points desc, `pointsFor` desc, `teamId` asc

- [ ] **Step 1: Write the failing tests**

Create `lib/stats/tables.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import {
  averageRecords,
  combinedRecords,
  rankTable,
  realRecords,
  winPoints,
} from '@/lib/stats/tables'
import type { SeasonData } from '@/lib/domain/types'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

const AFTER_SEASON = new Date('2026-08-20')
const idOf = (s: SeasonData, name: string) => s.teams.find((t) => t.name === name)!.teamId
const nameOf = (s: SeasonData, id: string) => s.teams.find((t) => t.teamId === id)!.name

describe('records, 2025 season', () => {
  const real = realRecords(season2025, AFTER_SEASON)
  const avg = averageRecords(season2025, AFTER_SEASON)
  const combined = combinedRecords(season2025, AFTER_SEASON)

  it('combined records reproduce the final published standings exactly', () => {
    // From test/fixtures/2025/getStandings.json "points" strings.
    const published: Record<string, string> = {
      'Leibbi davíðs': '43-1-26',
      'Einn ís Kaldal': '42-0-28',
      'The Füllkrug Express': '41-0-29',
      'Proof the Curse lives once more': '37-0-33',
      'Year of the Diallo': '35-0-35',
      'les Homms': '34-0-36',
      'Palm Air': '29-0-41',
      'Haaland, Sakalegur markaskorari': '28-1-41',
      'FC Slaughterhouse!': '28-0-42',
      'Earth, Wind & Maguire': '20-0-50',
    }
    for (const [name, wdl] of Object.entries(published)) {
      const r = combined.get(idOf(season2025, name))!
      expect(`${r.wins}-${r.draws}-${r.losses}`, name).toBe(wdl)
    }
  })

  it('splits Leibbi davíðs into 20-1-14 real and 23-0-12 vs the average', () => {
    const id = idOf(season2025, 'Leibbi davíðs')
    const r = real.get(id)!
    expect([r.wins, r.draws, r.losses, r.games]).toEqual([20, 1, 14, 35])
    expect(r.pointsFor).toBeCloseTo(3472, 6)
    expect(r.pointsAgainst).toBeCloseTo(3244.5, 6)
    const a = avg.get(id)!
    expect([a.wins, a.draws, a.losses]).toEqual([23, 0, 12])
  })

  it('real-only table: Einn ís Kaldal top on 24-0-11, Slaughterhouse bottom', () => {
    const table = rankTable(real)
    expect(nameOf(season2025, table[0].teamId)).toBe('Einn ís Kaldal')
    expect([table[0].wins, table[0].draws, table[0].losses]).toEqual([24, 0, 11])
    expect(nameOf(season2025, table[9].teamId)).toBe('FC Slaughterhouse!')
    expect(table.map((r) => nameOf(season2025, r.teamId))).toEqual([
      'Einn ís Kaldal',
      'Proof the Curse lives once more',
      'Leibbi davíðs',
      'The Füllkrug Express',
      'les Homms',
      'Haaland, Sakalegur markaskorari',
      'Palm Air',
      'Year of the Diallo',
      'Earth, Wind & Maguire',
      'FC Slaughterhouse!',
    ])
  })

  it('average-only table tells a different story: Leibbi top, Diallo 3rd', () => {
    const table = rankTable(avg)
    expect(table.map((r) => nameOf(season2025, r.teamId))).toEqual([
      'Leibbi davíðs',
      'The Füllkrug Express',
      'Year of the Diallo',
      'Einn ís Kaldal',
      'FC Slaughterhouse!',
      'les Homms',
      'Proof the Curse lives once more',
      'Palm Air',
      'Haaland, Sakalegur markaskorari',
      'Earth, Wind & Maguire',
    ])
  })

  it('breaks the 19-win tie between Füllkrug and les Homms on points-for', () => {
    const table = rankTable(real)
    const fk = table.findIndex((r) => nameOf(season2025, r.teamId) === 'The Füllkrug Express')
    const lh = table.findIndex((r) => nameOf(season2025, r.teamId) === 'les Homms')
    expect(winPoints(table[fk])).toBe(19)
    expect(winPoints(table[lh])).toBe(19)
    expect(fk).toBeLessThan(lh) // 3605.5 points-for beats 3237.75
  })

  it('is all zeros before the season starts', () => {
    const real = realRecords(season2025, new Date('2025-08-01'))
    for (const r of real.values()) {
      expect([r.wins, r.draws, r.losses, r.games, r.pointsFor]).toEqual([0, 0, 0, 0, 0])
    }
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stats/tables.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `lib/stats/tables.ts`**

```ts
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods } from '@/lib/domain/season'

export interface TeamRecord {
  teamId: TeamId
  wins: number
  draws: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  games: number
}

/** Fantrax ranks by wins plus half a point per draw. */
export function winPoints(r: Pick<TeamRecord, 'wins' | 'draws'>): number {
  return r.wins + 0.5 * r.draws
}

function blankRecords(season: SeasonData): Map<TeamId, TeamRecord> {
  return new Map(
    season.teams.map((t) => [
      t.teamId,
      { teamId: t.teamId, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 },
    ]),
  )
}

function tally(r: TeamRecord, forScore: number, againstScore: number): void {
  r.games += 1
  r.pointsFor += forScore
  r.pointsAgainst += againstScore
  if (forScore > againstScore) r.wins += 1
  else if (forScore < againstScore) r.losses += 1
  else r.draws += 1
}

/** Real-opponent record over settled periods. Half of every team's games. */
export function realRecords(season: SeasonData, now: Date): Map<TeamId, TeamRecord> {
  const settled = new Set(auditRegularPeriods(season, now).settled)
  const records = blankRecords(season)
  for (const f of season.fixtures) {
    if (!settled.has(f.period) || f.homeScore === null || f.awayScore === null) continue
    const home = records.get(f.homeTeamId)
    const away = records.get(f.awayTeamId)
    if (!home || !away) continue
    tally(home, f.homeScore, f.awayScore)
    tally(away, f.awayScore, f.homeScore)
  }
  return records
}

/** Record against *League Average* over settled periods. Near-pure skill. */
export function averageRecords(season: SeasonData, now: Date): Map<TeamId, TeamRecord> {
  const settled = new Set(auditRegularPeriods(season, now).settled)
  const records = blankRecords(season)
  for (const f of season.averageFixtures) {
    if (!settled.has(f.period) || f.teamScore === null || f.averageScore === null) continue
    const r = records.get(f.teamId)
    if (!r) continue
    tally(r, f.teamScore, f.averageScore)
  }
  return records
}

/** The official table: real and league-average fixtures summed. */
export function combinedRecords(season: SeasonData, now: Date): Map<TeamId, TeamRecord> {
  const real = realRecords(season, now)
  const avg = averageRecords(season, now)
  const combined = blankRecords(season)
  for (const [id, c] of combined) {
    for (const part of [real.get(id), avg.get(id)]) {
      if (!part) continue
      c.wins += part.wins
      c.draws += part.draws
      c.losses += part.losses
      c.pointsFor += part.pointsFor
      c.pointsAgainst += part.pointsAgainst
      c.games += part.games
    }
  }
  return combined
}

/** Win points desc, points-for desc, teamId asc — deterministic. */
export function rankTable(records: Map<TeamId, TeamRecord>): TeamRecord[] {
  return [...records.values()].sort(
    (a, b) =>
      winPoints(b) - winPoints(a) ||
      b.pointsFor - a.pointsFor ||
      a.teamId.localeCompare(b.teamId),
  )
}
```

- [ ] **Step 4: Run tests, then the full suite**

Run: `npx vitest run lib/stats/tables.test.ts` then `npm test`
Expected: PASS. The combined-vs-published-standings test is the module's proof of correctness — if any team's record is off, the bug is in the implementation, not the fixture.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/tables.ts lib/stats/tables.test.ts
git commit -m "Add real/average/combined records and table ranking"
```

---

### Task 5: All-play and expected-vs-actual (`lib/stats/luck.ts`)

**Files:**
- Create: `lib/stats/luck.ts`
- Test: `lib/stats/luck.test.ts`

**Interfaces:**
- Consumes: `auditRegularPeriods`, `scoresForPeriod`; `realRecords`, `winPoints` from Task 4.
- Produces:
  - `interface AllPlayRecord { teamId: TeamId; points: number; games: number; winPct: number }` — per settled gameweek, 1 point per team outscored, 0.5 per tie; `games` counts opponents faced
  - `allPlayRecords(season: SeasonData, now: Date): Map<TeamId, AllPlayRecord>`
  - `interface LuckEntry { teamId: TeamId; actualWinPoints: number; expectedWinPoints: number; delta: number }`
  - `luckIndex(season: SeasonData, now: Date): LuckEntry[]` — sorted delta desc (luckiest first); expected win points = Σ per settled period of (that period's all-play points ÷ (teams scored that period − 1))

- [ ] **Step 1: Write the failing tests**

Create `lib/stats/luck.test.ts` with the same fixture-loading preamble as `lib/stats/tables.test.ts` (`load`, `season2025`, `AFTER_SEASON`, `idOf`, `nameOf` — copy them; tasks may be read out of order), importing from `@/lib/stats/luck`:

```ts
describe('allPlayRecords, 2025 season', () => {
  const ap = allPlayRecords(season2025, AFTER_SEASON)

  it('Leibbi davíðs leads on 197 of 315', () => {
    const r = ap.get(idOf(season2025, 'Leibbi davíðs'))!
    expect(r.points).toBeCloseTo(197, 6)
    expect(r.games).toBe(315) // 35 gameweeks x 9 opponents
    expect(r.winPct).toBeCloseTo(197 / 315, 6)
  })

  it('Earth, Wind & Maguire trails on 91 of 315', () => {
    const r = ap.get(idOf(season2025, 'Earth, Wind & Maguire'))!
    expect(r.points).toBeCloseTo(91, 6)
  })

  it('total points across teams is one all-play tournament per gameweek', () => {
    const total = [...ap.values()].reduce((s, r) => s + r.points, 0)
    // 35 gameweeks x C(10,2) pairings, 1 point distributed per pairing
    expect(total).toBeCloseTo(35 * 45, 6)
  })
})

describe('luckIndex, 2025 season', () => {
  const luck = luckIndex(season2025, AFTER_SEASON)

  it('Year of the Diallo was the unluckiest team in the league: -7.5', () => {
    const last = luck[luck.length - 1]
    expect(nameOf(season2025, last.teamId)).toBe('Year of the Diallo')
    expect(last.actualWinPoints).toBeCloseTo(14, 6)
    expect(last.expectedWinPoints).toBeCloseTo(21.5, 6)
    expect(last.delta).toBeCloseTo(-7.5, 6)
  })

  it('Proof the Curse was the luckiest: +5.06', () => {
    expect(nameOf(season2025, luck[0].teamId)).toBe('Proof the Curse lives once more')
    expect(luck[0].delta).toBeCloseTo(5.0556, 3)
  })

  it('Einn ís Kaldal rode +4.78 of schedule luck to the real-table title', () => {
    const e = luck.find((x) => nameOf(season2025, x.teamId) === 'Einn ís Kaldal')!
    expect(e.actualWinPoints).toBeCloseTo(24, 6)
    expect(e.delta).toBeCloseTo(4.7778, 3)
  })

  it('is empty before the season starts', () => {
    expect(luckIndex(season2025, new Date('2025-08-01'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stats/luck.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `lib/stats/luck.ts`**

```ts
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods, scoresForPeriod } from '@/lib/domain/season'
import { realRecords, winPoints } from './tables'

export interface AllPlayRecord {
  teamId: TeamId
  /** 1 per team outscored in a gameweek, 0.5 per tie, summed over settled gameweeks. */
  points: number
  /** Opponents faced: (teams that gameweek - 1), summed. */
  games: number
  winPct: number
}

/** Every gameweek scored against the whole league, not just one opponent. */
export function allPlayRecords(season: SeasonData, now: Date): Map<TeamId, AllPlayRecord> {
  const { settled } = auditRegularPeriods(season, now)
  const acc = new Map<TeamId, { points: number; games: number }>()
  for (const period of settled) {
    const scores = scoresForPeriod(season, period)
    for (const [teamId, score] of scores) {
      const a = acc.get(teamId) ?? { points: 0, games: 0 }
      for (const [otherId, otherScore] of scores) {
        if (otherId === teamId) continue
        a.games += 1
        if (score > otherScore) a.points += 1
        else if (score === otherScore) a.points += 0.5
      }
      acc.set(teamId, a)
    }
  }
  return new Map(
    [...acc.entries()].map(([teamId, a]) => [
      teamId,
      { teamId, points: a.points, games: a.games, winPct: a.games ? a.points / a.games : 0 },
    ]),
  )
}

export interface LuckEntry {
  teamId: TeamId
  /** Win points actually banked from real fixtures. */
  actualWinPoints: number
  /** Win points an average schedule would have paid: all-play share per gameweek. */
  expectedWinPoints: number
  /** Positive = lucky. "+7 on what you deserved." */
  delta: number
}

/** Schedule luck: the gap between the record you have and the one you earned. */
export function luckIndex(season: SeasonData, now: Date): LuckEntry[] {
  const { settled } = auditRegularPeriods(season, now)
  if (settled.length === 0) return []

  const expected = new Map<TeamId, number>()
  for (const period of settled) {
    const scores = scoresForPeriod(season, period)
    if (scores.size < 2) continue
    for (const [teamId, score] of scores) {
      let points = 0
      for (const [otherId, otherScore] of scores) {
        if (otherId === teamId) continue
        if (score > otherScore) points += 1
        else if (score === otherScore) points += 0.5
      }
      expected.set(teamId, (expected.get(teamId) ?? 0) + points / (scores.size - 1))
    }
  }

  const real = realRecords(season, now)
  const entries: LuckEntry[] = [...expected.entries()].map(([teamId, exp]) => {
    const record = real.get(teamId)
    const actual = record ? winPoints(record) : 0
    return { teamId, actualWinPoints: actual, expectedWinPoints: exp, delta: actual - exp }
  })
  return entries.sort((a, b) => b.delta - a.delta || a.teamId.localeCompare(b.teamId))
}
```

- [ ] **Step 4: Run tests, then the full suite**

Run: `npx vitest run lib/stats/luck.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/luck.ts lib/stats/luck.test.ts
git commit -m "Add all-play records and schedule-luck index"
```

---

### Task 6: Schedule swap (`lib/stats/luck.ts`, continued)

**Files:**
- Modify: `lib/stats/luck.ts` (append)
- Test: `lib/stats/luck.test.ts` (append)

**Interfaces:**
- Consumes: `auditRegularPeriods`, `scoresForPeriod`, `realRecords`, `rankTable`, `winPoints`, `SeasonData.playoffTeams` (Task 3).
- Produces:
  - `interface ScheduleSwapEntry { teamId: TeamId; playoffCount: number; schedulesTried: number }`
  - `scheduleSwap(season: SeasonData, now: Date): ScheduleSwapEntry[]` — sorted `playoffCount` desc, `teamId` asc; `[]` when no settled periods

Semantics (spell these out in the module doc comment): for each pair (T, U ≠ T), T keeps its own weekly scores but plays U's real fixture list. When U's opponent in a week is T itself, T faces U's score that week. T's swapped record then replaces T's own row in the real-only table — every other team keeps its actual record and points-for — and T "makes the playoffs under U's schedule" if it ranks within `season.playoffTeams`. This perturbs only T's row, which is the standard, explainable presentation of "same scores, different schedule".

- [ ] **Step 1: Write the failing tests**

Append to `lib/stats/luck.test.ts`:

```ts
describe('scheduleSwap, 2025 season (5 playoff spots)', () => {
  const swap = scheduleSwap(season2025, AFTER_SEASON)
  const entry = (name: string) => swap.find((e) => nameOf(season2025, e.teamId) === name)!

  it('tries the 9 other schedules for each team', () => {
    expect(swap).toHaveLength(10)
    for (const e of swap) expect(e.schedulesTried).toBe(9)
  })

  it('les Homms missed the playoffs but makes it under all 9 other schedules', () => {
    expect(entry('les Homms').playoffCount).toBe(9)
  })

  it('Füllkrug and Diallo also make it under all 9', () => {
    expect(entry('The Füllkrug Express').playoffCount).toBe(9)
    expect(entry('Year of the Diallo').playoffCount).toBe(9)
  })

  it('Proof the Curse finished 2nd in the real table but survives only 5 of 9 swaps', () => {
    expect(entry('Proof the Curse lives once more').playoffCount).toBe(5)
  })

  it('the bottom teams make it under almost no schedule', () => {
    expect(entry('FC Slaughterhouse!').playoffCount).toBe(1)
    expect(entry('Palm Air').playoffCount).toBe(0)
    expect(entry('Haaland, Sakalegur markaskorari').playoffCount).toBe(0)
    expect(entry('Earth, Wind & Maguire').playoffCount).toBe(0)
  })

  it('is empty before the season starts', () => {
    expect(scheduleSwap(season2025, new Date('2025-08-01'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stats/luck.test.ts`
Expected: FAIL — `scheduleSwap` not exported.

- [ ] **Step 3: Implement (append to `lib/stats/luck.ts`)**

```ts
import { rankTable, type TeamRecord } from './tables'   // merge into the existing ./tables import

export interface ScheduleSwapEntry {
  teamId: TeamId
  /** Other teams' schedules under which this team would make the playoffs. */
  playoffCount: number
  schedulesTried: number
}

/**
 * "You would make playoffs under 11 of 13 schedules." For each other team
 * U, replay this team's weekly scores against U's real fixture list (when
 * U's opponent that week is this team, face U's score instead), substitute
 * the swapped record for this team's row in the real-only table, and count
 * a playoff finish (top season.playoffTeams by win points, points-for
 * tiebreak).
 */
export function scheduleSwap(season: SeasonData, now: Date): ScheduleSwapEntry[] {
  const { settled } = auditRegularPeriods(season, now)
  if (settled.length === 0) return []

  const scoresByPeriod = new Map(settled.map((p) => [p, scoresForPeriod(season, p)]))
  const opponentOf = new Map<string, TeamId>()
  for (const f of season.fixtures) {
    if (!scoresByPeriod.has(f.period)) continue
    opponentOf.set(`${f.period}:${f.homeTeamId}`, f.awayTeamId)
    opponentOf.set(`${f.period}:${f.awayTeamId}`, f.homeTeamId)
  }

  const real = realRecords(season, now)
  const teamIds = season.teams.map((t) => t.teamId)

  const entries = teamIds.map((teamId) => {
    let playoffCount = 0
    for (const otherId of teamIds) {
      if (otherId === teamId) continue
      const swapped: TeamRecord = {
        teamId,
        wins: 0,
        draws: 0,
        losses: 0,
        pointsFor: real.get(teamId)?.pointsFor ?? 0,
        pointsAgainst: 0,
        games: 0,
      }
      for (const [period, scores] of scoresByPeriod) {
        const myScore = scores.get(teamId)
        if (myScore === undefined) continue
        const opponent = opponentOf.get(`${period}:${otherId}`)
        if (opponent === undefined) continue
        const oppScore = opponent === teamId ? scores.get(otherId) : scores.get(opponent)
        if (oppScore === undefined) continue
        swapped.games += 1
        if (myScore > oppScore) swapped.wins += 1
        else if (myScore < oppScore) swapped.losses += 1
        else swapped.draws += 1
      }
      const rows = new Map(real)
      rows.set(teamId, swapped)
      const rank = rankTable(rows).findIndex((r) => r.teamId === teamId) + 1
      if (rank <= season.playoffTeams) playoffCount += 1
    }
    return { teamId, playoffCount, schedulesTried: teamIds.length - 1 }
  })

  return entries.sort(
    (a, b) => b.playoffCount - a.playoffCount || a.teamId.localeCompare(b.teamId),
  )
}
```

- [ ] **Step 4: Run tests, then the full suite**

Run: `npx vitest run lib/stats/luck.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/luck.ts lib/stats/luck.test.ts
git commit -m "Add schedule-swap playoff counterfactuals"
```

---

### Task 7: Points against, close games, average threshold (`lib/stats/luck.ts`, completed)

**Files:**
- Modify: `lib/stats/luck.ts` (append)
- Test: `lib/stats/luck.test.ts` (append)

**Interfaces:**
- Consumes: `auditRegularPeriods`, `scoresForPeriod`, `realRecords`.
- Produces:
  - `interface PointsAgainstEntry { teamId: TeamId; pointsAgainst: number; lossesToTopScore: number }`
  - `pointsAgainstTable(season: SeasonData, now: Date): PointsAgainstEntry[]` — hardest slate first (`pointsAgainst` desc, `teamId` asc)
  - `interface CloseGameReport { threshold: number; marginsSampled: number; records: Map<TeamId, TeamRecord> }`
  - `closeGameRecords(season: SeasonData, now: Date, percentile?: number): CloseGameReport` — threshold is the given percentile (default 0.25) of the season's own |margin| distribution, **never a hardcoded constant**; a game is close when |margin| ≤ threshold
  - `interface ThresholdPoint { period: number; threshold: number }`
  - `averageThresholds(season: SeasonData, now: Date): ThresholdPoint[]` — the score needed to beat the league mean each settled gameweek (the mean of that gameweek's real scores), ascending by period

- [ ] **Step 1: Write the failing tests**

Append to `lib/stats/luck.test.ts`:

```ts
describe('pointsAgainstTable, 2025 season', () => {
  const pa = pointsAgainstTable(season2025, AFTER_SEASON)

  it('Year of the Diallo faced the hardest slate: 3601.25 against, 7 losses to the top score', () => {
    expect(nameOf(season2025, pa[0].teamId)).toBe('Year of the Diallo')
    expect(pa[0].pointsAgainst).toBeCloseTo(3601.25, 6)
    expect(pa[0].lossesToTopScore).toBe(7)
  })

  it('The Füllkrug Express lost to the gameweek top score only twice', () => {
    const e = pa.find((x) => nameOf(season2025, x.teamId) === 'The Füllkrug Express')!
    expect(e.pointsAgainst).toBeCloseTo(3092.5, 6)
    expect(e.lossesToTopScore).toBe(2)
  })
})

describe('closeGameRecords, 2025 season', () => {
  const close = closeGameRecords(season2025, AFTER_SEASON)

  it('derives the threshold from the 25th percentile of the margin distribution', () => {
    expect(close.threshold).toBeCloseTo(10.5, 6)
    expect(close.marginsSampled).toBe(175) // 35 gameweeks x 5 real fixtures
  })

  it('Einn ís Kaldal won every one of its nine close games', () => {
    const r = close.records.get(idOf(season2025, 'Einn ís Kaldal'))!
    expect([r.wins, r.draws, r.losses]).toEqual([9, 0, 0])
  })

  it('FC Slaughterhouse! lost 11 of its 12 close games', () => {
    const r = close.records.get(idOf(season2025, 'FC Slaughterhouse!'))!
    expect([r.wins, r.draws, r.losses]).toEqual([1, 0, 11])
  })

  it("Leibbi davíðs' lone draw counts as a close game", () => {
    const r = close.records.get(idOf(season2025, 'Leibbi davíðs'))!
    expect([r.wins, r.draws, r.losses]).toEqual([6, 1, 6])
  })
})

describe('averageThresholds, 2025 season', () => {
  const thresholds = averageThresholds(season2025, AFTER_SEASON)

  it('produces one threshold per settled gameweek', () => {
    expect(thresholds).toHaveLength(35)
    expect(thresholds[0].period).toBe(1)
    expect(thresholds[34].period).toBe(35)
  })

  it('gameweek 1 needed 101.15 (the fixture-documented league average)', () => {
    expect(thresholds[0].threshold).toBeCloseTo(101.15, 6)
  })

  it('gameweek 35 needed 95.775', () => {
    expect(thresholds[34].threshold).toBeCloseTo(95.775, 6)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stats/luck.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement (append to `lib/stats/luck.ts`)**

```ts
export interface PointsAgainstEntry {
  teamId: TeamId
  pointsAgainst: number
  /** Losses where the opponent posted the gameweek's top score. */
  lossesToTopScore: number
}

/** Hardest slate faced, plus how often the schedule served up the buzzsaw. */
export function pointsAgainstTable(season: SeasonData, now: Date): PointsAgainstEntry[] {
  const { settled } = auditRegularPeriods(season, now)
  const settledSet = new Set(settled)
  const real = realRecords(season, now)
  const losses = new Map<TeamId, number>()

  for (const period of settled) {
    const scores = scoresForPeriod(season, period)
    if (scores.size === 0) continue
    const top = Math.max(...scores.values())
    for (const f of season.fixtures) {
      if (f.period !== period || f.homeScore === null || f.awayScore === null) continue
      const [loser, loserScore, winnerScore] =
        f.homeScore < f.awayScore
          ? [f.homeTeamId, f.homeScore, f.awayScore]
          : [f.awayTeamId, f.awayScore, f.homeScore]
      if (winnerScore > loserScore && winnerScore === top) {
        losses.set(loser, (losses.get(loser) ?? 0) + 1)
      }
    }
  }

  return [...real.values()]
    .map((r) => ({
      teamId: r.teamId,
      pointsAgainst: r.pointsAgainst,
      lossesToTopScore: losses.get(r.teamId) ?? 0,
    }))
    .sort((a, b) => b.pointsAgainst - a.pointsAgainst || a.teamId.localeCompare(b.teamId))
}

export interface CloseGameReport {
  /** |margin| at the given percentile of this season's own distribution. */
  threshold: number
  marginsSampled: number
  records: Map<TeamId, TeamRecord>
}

/** Record in nail-biters. The threshold comes from the league's own margins. */
export function closeGameRecords(
  season: SeasonData,
  now: Date,
  percentile = 0.25,
): CloseGameReport {
  const settled = new Set(auditRegularPeriods(season, now).settled)
  const played = season.fixtures.filter(
    (f) => settled.has(f.period) && f.homeScore !== null && f.awayScore !== null,
  )
  const margins = played
    .map((f) => Math.abs((f.homeScore as number) - (f.awayScore as number)))
    .sort((a, b) => a - b)

  const records = new Map<TeamId, TeamRecord>(
    season.teams.map((t) => [
      t.teamId,
      { teamId: t.teamId, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 },
    ]),
  )
  if (margins.length === 0) return { threshold: 0, marginsSampled: 0, records }

  const threshold = margins[Math.floor(percentile * (margins.length - 1))]
  for (const f of played) {
    const home = f.homeScore as number
    const away = f.awayScore as number
    if (Math.abs(home - away) > threshold) continue
    for (const [id, mine, theirs] of [
      [f.homeTeamId, home, away],
      [f.awayTeamId, away, home],
    ] as const) {
      const r = records.get(id)
      if (!r) continue
      r.games += 1
      r.pointsFor += mine
      r.pointsAgainst += theirs
      if (mine > theirs) r.wins += 1
      else if (mine < theirs) r.losses += 1
      else r.draws += 1
    }
  }
  return { threshold, marginsSampled: margins.length, records }
}

export interface ThresholdPoint {
  period: number
  /** The league mean that gameweek — score above it and you beat the average. */
  threshold: number
}

/** The moving bar: what it took to beat the league mean, week by week. */
export function averageThresholds(season: SeasonData, now: Date): ThresholdPoint[] {
  const { settled } = auditRegularPeriods(season, now)
  return settled.map((period) => {
    const scores = [...scoresForPeriod(season, period).values()]
    const threshold = scores.reduce((s, x) => s + x, 0) / scores.length
    return { period, threshold }
  })
}
```

Note: "who clears the bar most reliably" is exactly `averageRecords` from Task 4 — the UI combines the two; no new function needed.

- [ ] **Step 4: Run tests, then the full suite**

Run: `npx vitest run lib/stats/luck.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/luck.ts lib/stats/luck.test.ts
git commit -m "Add points-against, close-game and average-threshold stats"
```

---

## Phase 2 — Rivalries

### Task 8: Cross-season manager identity (`config/managers.ts` + `lib/stats/managers.ts`)

**Files:**
- Create: `config/managers.ts`, `lib/stats/managers.ts`
- Test: `lib/stats/managers.test.ts`

**Interfaces:**
- Consumes: `SeasonData.teams` only. Also `adaptLeagueInfo` in the test to get real 2026 teams.
- Produces (used by Tasks 9–10 and the UI):
  - `MANAGER_OVERRIDES: Record<TeamId, string>` from `config/managers.ts` (currently empty — all eight returning managers match by exact name)
  - `slugifyManagerId(name: string): string`
  - `interface ManagerTeam { seasonYear: number; teamId: TeamId; teamName: string }`
  - `interface Manager { managerId: ManagerId; displayName: string; teams: ManagerTeam[] }`
  - `interface ManagerResolution { managers: Manager[]; returning: Manager[]; singleSeason: Manager[] }`
  - `resolveManagers(seasons: SeasonData[], overrides?: Record<TeamId, string>): ManagerResolution`

Semantics: managers are matched across seasons by **exact team name** (after the slug normalization below); `MANAGER_OVERRIDES` maps a specific season's `teamId` to a manager id when a name drifts. Every team maps to exactly one manager — an unmatched team is never dropped; it becomes a single-season manager and is surfaced in `singleSeason`. Two teams in the *same* season resolving to one manager is a configuration error and must throw. `displayName` is the team name from the manager's most recent season. `managers` is sorted by `displayName` (locale `is`), and `teams` within a manager by `seasonYear` ascending.

Known slugs (the slug algorithm is fixed; these are its verified outputs — handy for overrides and tests):
`the-fullkrug-express`, `proof-the-curse-lives-once-more`, `leibbi-davi-s` (the ð is not a combining mark and drops to a hyphen), `einn-is-kaldal`, `haaland-sakalegur-markaskorari`, `year-of-the-diallo`, `fc-slaughterhouse`, `les-homms`, `palm-air`, `earth-wind-maguire`.

- [ ] **Step 1: Write the failing tests**

Create `lib/stats/managers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LeagueInfoSchema, ScheduleResponseSchema } from '@/lib/fantrax/schemas'
import { buildSeasonData } from '@/lib/adapt/season'
import { adaptLeagueInfo } from '@/lib/adapt/leagueInfo'
import { resolveManagers, slugifyManagerId } from '@/lib/stats/managers'
import { syntheticSeason } from '@/test/helpers/synthetic'
import type { SeasonData } from '@/lib/domain/types'

const load = (y: number, f: string) => JSON.parse(readFileSync(`test/fixtures/${y}/${f}`, 'utf8'))

const season2025 = buildSeasonData(
  LeagueInfoSchema.parse(load(2025, 'getLeagueInfo.json')),
  ScheduleResponseSchema.parse(load(2025, 'fxpa-getStandings-schedule.json')),
  '7he4pkgpme8uz58b',
)

// There is no committed 2026 schedule response (pre-season capture), so the
// 2026 SeasonData is assembled from the real 2026 league info plus empty
// fixture lists. Team identity is all this module needs.
const info2026 = adaptLeagueInfo(LeagueInfoSchema.parse(load(2026, 'getLeagueInfo.json')))
const season2026: SeasonData = {
  seasonYear: info2026.seasonYear,
  leagueId: 'ywhebyp7msyix1sj',
  leagueName: info2026.leagueName,
  regularSeasonPeriods: info2026.regularSeasonPeriods,
  totalPeriods: info2026.totalPeriods,
  playoffTeams: info2026.playoffTeams,
  teams: info2026.teams,
  periods: info2026.periods,
  fixtures: [],
  averageFixtures: [],
}

describe('slugifyManagerId', () => {
  it('strips diacritics and punctuation deterministically', () => {
    expect(slugifyManagerId('The Füllkrug Express')).toBe('the-fullkrug-express')
    expect(slugifyManagerId('Leibbi davíðs')).toBe('leibbi-davi-s')
    expect(slugifyManagerId('Earth, Wind & Maguire')).toBe('earth-wind-maguire')
    expect(slugifyManagerId('FC Slaughterhouse!')).toBe('fc-slaughterhouse')
  })
})

describe('resolveManagers across 2025 and 2026', () => {
  const resolution = resolveManagers([season2025, season2026], {})

  it('finds exactly the eight returning managers', () => {
    const names = resolution.returning.map((m) => m.displayName).sort()
    expect(names).toEqual([
      'Einn ís Kaldal',
      'FC Slaughterhouse!',
      'Haaland, Sakalegur markaskorari',
      'Leibbi davíðs',
      'Proof the Curse lives once more',
      'The Füllkrug Express',
      'Year of the Diallo',
      'les Homms',
    ])
  })

  it('surfaces single-season teams explicitly instead of dropping them', () => {
    const names = resolution.singleSeason.map((m) => m.displayName).sort()
    expect(names).toEqual([
      'Earth, Wind & Maguire', // 2025 only
      'Jonoli',
      'Palm Air', // 2025 only
      'Sgudmundsson',
      "Slot's Guld",
      'arnibarnason',
      'fannaroa',
      'hordurb',
    ])
  })

  it('accounts for every team in both seasons exactly once', () => {
    const teamCount = resolution.managers.reduce((s, m) => s + m.teams.length, 0)
    expect(teamCount).toBe(season2025.teams.length + season2026.teams.length) // 10 + 14
    expect(resolution.managers).toHaveLength(16) // 8 returning + 8 single-season
  })

  it('a returning manager carries both seasons in year order', () => {
    const fk = resolution.returning.find((m) => m.managerId === 'the-fullkrug-express')!
    expect(fk.teams.map((t) => t.seasonYear)).toEqual([2025, 2026])
    expect(fk.teams[0].teamId).toBe('xc98xpvcme8uz58j')
    expect(fk.teams[1].teamId).toBe('6y6vpiv2msyix1uy')
  })

  it('an override reunites a renamed team with its manager', () => {
    const renamed = syntheticSeason({
      seasonYear: 2027,
      teams: [{ teamId: 'NEW1', name: 'Totally New Name FC', shortName: null, logoUrl: null }],
    })
    const r = resolveManagers([season2025, renamed], { NEW1: 'the-fullkrug-express' })
    const fk = r.returning.find((m) => m.managerId === 'the-fullkrug-express')!
    expect(fk.teams.map((t) => t.seasonYear)).toEqual([2025, 2027])
    expect(fk.displayName).toBe('Totally New Name FC') // most recent season's name
  })

  it('throws when two teams in one season resolve to the same manager', () => {
    const dupes = syntheticSeason({
      seasonYear: 2027,
      teams: [
        { teamId: 'X1', name: 'Same Name', shortName: null, logoUrl: null },
        { teamId: 'X2', name: 'Same Name', shortName: null, logoUrl: null },
      ],
    })
    expect(() => resolveManagers([dupes], {})).toThrow(/same manager/i)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stats/managers.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Create `config/managers.ts`**

```ts
import type { TeamId } from '@/lib/domain/types'

/**
 * Cross-season manager identity overrides.
 *
 * Managers are matched across seasons by exact team name (see
 * lib/stats/managers.ts). Names drift; when a manager renames their team,
 * map the new season's teamId to their canonical manager id here. As of
 * 2026 all eight returning managers kept their exact 2025 team names, so
 * this is empty — it is the escape hatch, not dead code.
 */
export const MANAGER_OVERRIDES: Record<TeamId, string> = {}
```

- [ ] **Step 4: Create `lib/stats/managers.ts`**

```ts
import type { ManagerId, SeasonData, TeamId } from '@/lib/domain/types'
import { MANAGER_OVERRIDES } from '@/config/managers'

export interface ManagerTeam {
  seasonYear: number
  teamId: TeamId
  teamName: string
}

export interface Manager {
  managerId: ManagerId
  /** Team name from the manager's most recent season. */
  displayName: string
  /** One entry per season, ascending by year. */
  teams: ManagerTeam[]
}

export interface ManagerResolution {
  managers: Manager[]
  /** Managers present in two or more seasons. */
  returning: Manager[]
  /**
   * Teams matched to no other season. Surfaced explicitly — a rename that
   * slipped past MANAGER_OVERRIDES shows up here, never silently dropped.
   */
  singleSeason: Manager[]
}

/** Deterministic id from a team name: NFKD, strip accents, kebab-case. */
export function slugifyManagerId(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function resolveManagers(
  seasons: SeasonData[],
  overrides: Record<TeamId, string> = MANAGER_OVERRIDES,
): ManagerResolution {
  const byManager = new Map<ManagerId, ManagerTeam[]>()
  const ordered = [...seasons].sort((a, b) => a.seasonYear - b.seasonYear)

  for (const season of ordered) {
    const seenThisSeason = new Map<ManagerId, string>()
    for (const team of season.teams) {
      const managerId = overrides[team.teamId] ?? slugifyManagerId(team.name)
      const clash = seenThisSeason.get(managerId)
      if (clash !== undefined) {
        throw new Error(
          `Teams "${clash}" and "${team.name}" in season ${season.seasonYear} ` +
            `resolve to the same manager "${managerId}" — fix config/managers.ts`,
        )
      }
      seenThisSeason.set(managerId, team.name)
      const teams = byManager.get(managerId) ?? []
      teams.push({ seasonYear: season.seasonYear, teamId: team.teamId, teamName: team.name })
      byManager.set(managerId, teams)
    }
  }

  const managers: Manager[] = [...byManager.entries()]
    .map(([managerId, teams]) => ({
      managerId,
      displayName: teams[teams.length - 1].teamName,
      teams,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'is'))

  return {
    managers,
    returning: managers.filter((m) => m.teams.length >= 2),
    singleSeason: managers.filter((m) => m.teams.length === 1),
  }
}
```

If the sorted `singleSeason` name order in the test disagrees with `localeCompare(..., 'is')` output, the failing assertion's `.sort()` uses default string sort — align the test's expectation array order with what plain `Array.prototype.sort()` produces for those literals (the test sorts the names itself, so this only matters if it flags a genuine mismatch).

- [ ] **Step 5: Run tests, then the full suite**

Run: `npx vitest run lib/stats/managers.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add config/managers.ts lib/stats/managers.ts lib/stats/managers.test.ts
git commit -m "Add cross-season manager identity with override escape hatch"
```

---

### Task 9: Head-to-head matrix, nemesis and bunny (`lib/stats/rivalries.ts`)

**Files:**
- Create: `lib/stats/rivalries.ts`
- Test: `lib/stats/rivalries.test.ts`

**Interfaces:**
- Consumes: `auditRegularPeriods`; `ManagerResolution`, `Manager` from Task 8.
- Produces:
  - `interface Meeting { seasonYear: number; period: number; forScore: number; againstScore: number; margin: number }`
  - `interface HeadToHead { managerId: ManagerId; opponentId: ManagerId; meetings: Meeting[]; wins: number; draws: number; losses: number; aggregateMargin: number }`
  - `headToHeadMatrix(seasons: SeasonData[], resolution: ManagerResolution, now: Date): HeadToHead[]` — one entry per **ordered** pair with ≥1 meeting (so A-vs-B and B-vs-A both exist, mirrored); meetings chronological (seasonYear, then period)
  - `interface RivalVerdict { opponentId: ManagerId; meetings: number; avgMargin: number }`
  - `interface NemesisBunny { managerId: ManagerId; nemesis: RivalVerdict | null; bunny: RivalVerdict | null }`
  - `nemesisAndBunny(matrix: HeadToHead[], minMeetings?: number): NemesisBunny[]` — nemesis = lowest average margin, bunny = highest, among opponents with ≥ `minMeetings` (default 2); `null` when no opponent qualifies — an honest early-season state, not an error

Only meetings in settled periods count. Meetings are matched at the **manager** level via `resolution`, so a 2025 meeting and a 2026 meeting between the same two people aggregate even though their teamIds differ.

- [ ] **Step 1: Write the failing tests**

Create `lib/stats/rivalries.test.ts` with the same fixture-loading preamble as `lib/stats/tables.test.ts` (`load`, `season2025`, `AFTER_SEASON`), plus:

```ts
import { headToHeadMatrix, nemesisAndBunny } from '@/lib/stats/rivalries'
import { resolveManagers } from '@/lib/stats/managers'

const resolution = resolveManagers([season2025], {})
const matrix = headToHeadMatrix([season2025], resolution, AFTER_SEASON)
const h2h = (a: string, b: string) =>
  matrix.find((x) => x.managerId === a && x.opponentId === b)!

describe('headToHeadMatrix, 2025 season', () => {
  it('Füllkrug vs Proof the Curse: four meetings, 1-0-3, -16.5 aggregate', () => {
    const x = h2h('the-fullkrug-express', 'proof-the-curse-lives-once-more')
    expect(x.meetings).toHaveLength(4)
    expect([x.wins, x.draws, x.losses]).toEqual([1, 0, 3])
    expect(x.aggregateMargin).toBeCloseTo(-16.5, 6)
  })

  it('the mirrored entry is the exact inverse', () => {
    const x = h2h('proof-the-curse-lives-once-more', 'the-fullkrug-express')
    expect([x.wins, x.draws, x.losses]).toEqual([3, 0, 1])
    expect(x.aggregateMargin).toBeCloseTo(16.5, 6)
  })

  it('Füllkrug swept Leibbi davíðs 4-0-0 by +164', () => {
    const x = h2h('the-fullkrug-express', 'leibbi-davi-s')
    expect([x.wins, x.draws, x.losses]).toEqual([4, 0, 0])
    expect(x.aggregateMargin).toBeCloseTo(164, 6)
  })

  it('an uneven schedule leaves Füllkrug vs Einn ís at three meetings', () => {
    const x = h2h('the-fullkrug-express', 'einn-is-kaldal')
    expect(x.meetings).toHaveLength(3)
  })

  it('meetings are chronological and carry real scores', () => {
    const x = h2h('the-fullkrug-express', 'proof-the-curse-lives-once-more')
    const periods = x.meetings.map((m) => m.period)
    expect(periods).toEqual([...periods].sort((a, b) => a - b))
    for (const m of x.meetings) {
      expect(m.seasonYear).toBe(2025)
      expect(m.margin).toBeCloseTo(m.forScore - m.againstScore, 6)
    }
  })

  it('is empty before the season starts', () => {
    expect(headToHeadMatrix([season2025], resolution, new Date('2025-08-01'))).toEqual([])
  })
})

describe('nemesisAndBunny, 2025 season', () => {
  const verdicts = nemesisAndBunny(matrix)
  const fk = verdicts.find((v) => v.managerId === 'the-fullkrug-express')!

  it("Füllkrug's nemesis is Proof the Curse (-4.125 per meeting)", () => {
    expect(fk.nemesis!.opponentId).toBe('proof-the-curse-lives-once-more')
    expect(fk.nemesis!.avgMargin).toBeCloseTo(-4.125, 6)
  })

  it("Füllkrug's bunny is Earth, Wind & Maguire (+43.19 per meeting)", () => {
    expect(fk.bunny!.opponentId).toBe('earth-wind-maguire')
    expect(fk.bunny!.avgMargin).toBeCloseTo(43.1875, 6)
  })

  it('returns null verdicts when no opponent reaches the meeting minimum', () => {
    const sparse = nemesisAndBunny(matrix, 10)
    for (const v of sparse) {
      expect(v.nemesis).toBeNull()
      expect(v.bunny).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stats/rivalries.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `lib/stats/rivalries.ts`**

```ts
import type { ManagerId, SeasonData } from '@/lib/domain/types'
import { auditRegularPeriods } from '@/lib/domain/season'
import type { ManagerResolution } from './managers'

export interface Meeting {
  seasonYear: number
  period: number
  forScore: number
  againstScore: number
  margin: number
}

export interface HeadToHead {
  managerId: ManagerId
  opponentId: ManagerId
  /** Chronological: season, then gameweek. */
  meetings: Meeting[]
  wins: number
  draws: number
  losses: number
  /** Sum of margins from managerId's point of view. */
  aggregateMargin: number
}

/**
 * Every real meeting between two managers across all given seasons,
 * matched at the manager level so team renames and per-season teamIds
 * do not split a rivalry. One entry per ordered pair; A-vs-B and B-vs-A
 * are mirrors.
 */
export function headToHeadMatrix(
  seasons: SeasonData[],
  resolution: ManagerResolution,
  now: Date,
): HeadToHead[] {
  const managerOfTeam = new Map<string, ManagerId>()
  for (const m of resolution.managers) {
    for (const t of m.teams) managerOfTeam.set(`${t.seasonYear}:${t.teamId}`, m.managerId)
  }

  const pairs = new Map<string, HeadToHead>()
  const record = (
    managerId: ManagerId,
    opponentId: ManagerId,
    meeting: Meeting,
  ) => {
    const key = `${managerId}|${opponentId}`
    const entry =
      pairs.get(key) ??
      { managerId, opponentId, meetings: [], wins: 0, draws: 0, losses: 0, aggregateMargin: 0 }
    entry.meetings.push(meeting)
    entry.aggregateMargin += meeting.margin
    if (meeting.margin > 0) entry.wins += 1
    else if (meeting.margin < 0) entry.losses += 1
    else entry.draws += 1
    pairs.set(key, entry)
  }

  for (const season of [...seasons].sort((a, b) => a.seasonYear - b.seasonYear)) {
    const settled = new Set(auditRegularPeriods(season, now).settled)
    const ordered = [...season.fixtures].sort((a, b) => a.period - b.period)
    for (const f of ordered) {
      if (!settled.has(f.period) || f.homeScore === null || f.awayScore === null) continue
      const home = managerOfTeam.get(`${season.seasonYear}:${f.homeTeamId}`)
      const away = managerOfTeam.get(`${season.seasonYear}:${f.awayTeamId}`)
      if (!home || !away) continue
      record(home, away, {
        seasonYear: season.seasonYear,
        period: f.period,
        forScore: f.homeScore,
        againstScore: f.awayScore,
        margin: f.homeScore - f.awayScore,
      })
      record(away, home, {
        seasonYear: season.seasonYear,
        period: f.period,
        forScore: f.awayScore,
        againstScore: f.homeScore,
        margin: f.awayScore - f.homeScore,
      })
    }
  }
  return [...pairs.values()]
}

export interface RivalVerdict {
  opponentId: ManagerId
  meetings: number
  avgMargin: number
}

export interface NemesisBunny {
  managerId: ManagerId
  /** Worst opponent by average margin, or null until enough meetings exist. */
  nemesis: RivalVerdict | null
  /** Best opponent by average margin. */
  bunny: RivalVerdict | null
}

export function nemesisAndBunny(matrix: HeadToHead[], minMeetings = 2): NemesisBunny[] {
  const byManager = new Map<ManagerId, RivalVerdict[]>()
  for (const h of matrix) {
    if (h.meetings.length < minMeetings) continue
    const list = byManager.get(h.managerId) ?? []
    list.push({
      opponentId: h.opponentId,
      meetings: h.meetings.length,
      avgMargin: h.aggregateMargin / h.meetings.length,
    })
    byManager.set(h.managerId, list)
  }

  const managerIds = [...new Set(matrix.map((h) => h.managerId))]
  return managerIds.map((managerId) => {
    const rivals = byManager.get(managerId) ?? []
    const sorted = [...rivals].sort(
      (a, b) =>
        a.avgMargin - b.avgMargin ||
        b.meetings - a.meetings ||
        a.opponentId.localeCompare(b.opponentId),
    )
    return {
      managerId,
      nemesis: sorted[0] ?? null,
      bunny: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    }
  })
}
```

- [ ] **Step 4: Run tests, then the full suite**

Run: `npx vitest run lib/stats/rivalries.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/rivalries.ts lib/stats/rivalries.test.ts
git commit -m "Add head-to-head matrix with nemesis and bunny verdicts"
```

---

### Task 10: Revenge fixtures (`lib/stats/rivalries.ts`, completed)

**Files:**
- Modify: `lib/stats/rivalries.ts` (append)
- Test: `lib/stats/rivalries.test.ts` (append)

**Interfaces:**
- Consumes: `headToHeadMatrix`, `isPeriodComplete` from `lib/domain/season`, `ManagerResolution`.
- Produces:
  - `interface RevengeFixture { seasonYear: number; period: number; managerId: ManagerId; opponentId: ManagerId; lastMeeting: Meeting }`
  - `revengeFixtures(seasons: SeasonData[], resolution: ManagerResolution, now: Date): RevengeFixture[]` — sorted by period ascending, then managerId

Semantics: an *upcoming* fixture is one in the most recent season whose period has **not ended** (`isPeriodComplete` false — a withheld already-played period is not "upcoming"). For each upcoming fixture between two managers who have met before (any season, settled periods only), the side that **lost the most recent meeting** gets a revenge fixture. A drawn or non-existent last meeting produces nothing.

The 2025+2026 pairing cannot be exercised with committed fixtures (no 2026 schedule response exists), so the tests are synthetic two-season setups — this also proves the cross-season manager matching end-to-end.

- [ ] **Step 1: Write the failing tests**

Append to `lib/stats/rivalries.test.ts`:

```ts
import { revengeFixtures } from '@/lib/stats/rivalries'
import { syntheticSeason, SYNTHETIC_SEASON_OVER } from '@/test/helpers/synthetic'
import type { Team } from '@/lib/domain/types'

describe('revengeFixtures', () => {
  // Same two managers in both seasons, different teamIds — the realistic shape.
  const teams2098: Team[] = [
    { teamId: 'OLD-A', name: 'Alpha FC', shortName: null, logoUrl: null },
    { teamId: 'OLD-B', name: 'Bravo United', shortName: null, logoUrl: null },
  ]
  const teams2099: Team[] = [
    { teamId: 'NEW-A', name: 'Alpha FC', shortName: null, logoUrl: null },
    { teamId: 'NEW-B', name: 'Bravo United', shortName: null, logoUrl: null },
  ]
  // 2098 is fully settled: Alpha beat Bravo in GW1, Bravo won the rematch in GW2.
  const past = syntheticSeason({
    seasonYear: 2098,
    teams: teams2098,
    periods: [
      { number: 1, startDate: '2098-01-01T00:00:00.000Z', endDate: '2098-01-08T00:00:00.000Z' },
      { number: 2, startDate: '2098-01-08T00:00:00.000Z', endDate: '2098-01-15T00:00:00.000Z' },
    ],
    fixtures: [
      { period: 1, homeTeamId: 'OLD-A', awayTeamId: 'OLD-B', homeScore: 100, awayScore: 50 },
      { period: 2, homeTeamId: 'OLD-B', awayTeamId: 'OLD-A', homeScore: 90, awayScore: 60 },
    ],
  })
  // 2099's meeting has not been played; its period ends in the future.
  const current = syntheticSeason({
    seasonYear: 2099,
    teams: teams2099,
    fixtures: [
      { period: 1, homeTeamId: 'NEW-A', awayTeamId: 'NEW-B', homeScore: null, awayScore: null },
    ],
  })
  const resolution = resolveManagers([past, current], {})
  const NOW = new Date('2098-06-01') // 2098 settled, 2099 periods still open

  it('the manager who lost the last meeting is owed revenge', () => {
    const revenge = revengeFixtures([past, current], resolution, NOW)
    expect(revenge).toHaveLength(1)
    expect(revenge[0].managerId).toBe('alpha-fc') // lost the GW2 rematch 60-90
    expect(revenge[0].opponentId).toBe('bravo-united')
    expect(revenge[0].seasonYear).toBe(2099)
    expect(revenge[0].period).toBe(1)
    expect(revenge[0].lastMeeting.margin).toBeCloseTo(-30, 6)
    expect(revenge[0].lastMeeting.seasonYear).toBe(2098)
  })

  it('no revenge when the pair has never met', () => {
    const strangers = syntheticSeason({
      seasonYear: 2099,
      teams: [
        { teamId: 'NEW-A', name: 'Alpha FC', shortName: null, logoUrl: null },
        { teamId: 'NEW-C', name: 'Charlie Town', shortName: null, logoUrl: null },
      ],
      fixtures: [
        { period: 1, homeTeamId: 'NEW-A', awayTeamId: 'NEW-C', homeScore: null, awayScore: null },
      ],
    })
    const r = resolveManagers([past, strangers], {})
    expect(revengeFixtures([past, strangers], r, NOW)).toEqual([])
  })

  it('a fixture in an already-ended period is not upcoming', () => {
    expect(revengeFixtures([past, current], resolution, SYNTHETIC_SEASON_OVER)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stats/rivalries.test.ts`
Expected: FAIL — `revengeFixtures` not exported.

- [ ] **Step 3: Implement (append to `lib/stats/rivalries.ts`)**

```ts
import { isPeriodComplete } from '@/lib/domain/season'   // merge into the existing import

export interface RevengeFixture {
  seasonYear: number
  period: number
  /** The manager owed revenge — they lost the last meeting. */
  managerId: ManagerId
  opponentId: ManagerId
  /** That loss, from managerId's point of view. */
  lastMeeting: Meeting
}

/** Upcoming fixtures where one side lost the previous meeting. */
export function revengeFixtures(
  seasons: SeasonData[],
  resolution: ManagerResolution,
  now: Date,
): RevengeFixture[] {
  if (seasons.length === 0) return []
  const current = seasons.reduce((a, b) => (b.seasonYear > a.seasonYear ? b : a))

  const managerOfTeam = new Map<string, ManagerId>()
  for (const m of resolution.managers) {
    for (const t of m.teams) managerOfTeam.set(`${t.seasonYear}:${t.teamId}`, m.managerId)
  }

  const matrix = headToHeadMatrix(seasons, resolution, now)
  const lastMeeting = new Map<string, Meeting>()
  for (const h of matrix) {
    // meetings are chronological; the last one is the most recent
    lastMeeting.set(`${h.managerId}|${h.opponentId}`, h.meetings[h.meetings.length - 1])
  }

  const out: RevengeFixture[] = []
  for (const f of current.fixtures) {
    if (f.period > current.regularSeasonPeriods) continue
    if (isPeriodComplete(current, f.period, now)) continue
    const home = managerOfTeam.get(`${current.seasonYear}:${f.homeTeamId}`)
    const away = managerOfTeam.get(`${current.seasonYear}:${f.awayTeamId}`)
    if (!home || !away) continue
    for (const [mine, theirs] of [
      [home, away],
      [away, home],
    ] as const) {
      const last = lastMeeting.get(`${mine}|${theirs}`)
      if (last && last.margin < 0) {
        out.push({
          seasonYear: current.seasonYear,
          period: f.period,
          managerId: mine,
          opponentId: theirs,
          lastMeeting: last,
        })
      }
    }
  }
  return out.sort(
    (a, b) => a.period - b.period || a.managerId.localeCompare(b.managerId),
  )
}
```

- [ ] **Step 4: Run tests, then the full suite**

Run: `npx vitest run lib/stats/rivalries.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/rivalries.ts lib/stats/rivalries.test.ts
git commit -m "Add revenge fixtures from upcoming schedule"
```

---

## Phase 3 — Records and superlatives

### Task 11: Extremes, streaks, form table (`lib/stats/records.ts`)

**Files:**
- Create: `lib/stats/records.ts`
- Test: `lib/stats/records.test.ts`

**Interfaces:**
- Consumes: `auditRegularPeriods`, `scoresForPeriod`; `TeamRecord`, `rankTable` from Task 4.
- Produces:
  - `interface ScoreExtreme { teamId: TeamId; period: number; score: number }`
  - `scoreExtremes(season: SeasonData, now: Date): { highest: ScoreExtreme | null; lowest: ScoreExtreme | null }` — over all settled gameweek scores; on a tie the earlier period wins
  - `type MatchResult = 'W' | 'D' | 'L'`
  - `interface StreakInfo { teamId: TeamId; longestWin: number; longestLoss: number; current: { type: MatchResult; length: number } | null; lastFive: MatchResult[] }` — real fixtures only, chronological; `current` is the run the team is on right now (null with no games); `lastFive` most recent last
  - `streaks(season: SeasonData, now: Date): StreakInfo[]` — one per team
  - `interface FormTable { window: number; periods: number[]; rows: TeamRecord[] }`
  - `formTable(season: SeasonData, now: Date, window?: number): FormTable` — real records over the last `min(window, settled)` settled gameweeks (default window 6), rows ranked by `rankTable`; `pointsFor`/`pointsAgainst` are window sums, which is what the tiebreak uses

- [ ] **Step 1: Write the failing tests**

Create `lib/stats/records.test.ts` with the same fixture-loading preamble as `lib/stats/tables.test.ts` (`load`, `season2025`, `AFTER_SEASON`, `idOf`, `nameOf`), importing from `@/lib/stats/records`:

```ts
describe('scoreExtremes, 2025 season', () => {
  const { highest, lowest } = scoreExtremes(season2025, AFTER_SEASON)

  it('Leibbi davíðs posted the season high: 173.5 in gameweek 33', () => {
    expect(nameOf(season2025, highest!.teamId)).toBe('Leibbi davíðs')
    expect(highest!.period).toBe(33)
    expect(highest!.score).toBeCloseTo(173.5, 6)
  })

  it('Earth, Wind & Maguire posted the season low: 16.25 in gameweek 29', () => {
    expect(nameOf(season2025, lowest!.teamId)).toBe('Earth, Wind & Maguire')
    expect(lowest!.period).toBe(29)
    expect(lowest!.score).toBeCloseTo(16.25, 6)
  })

  it('is null-null before the season starts', () => {
    expect(scoreExtremes(season2025, new Date('2025-08-01'))).toEqual({
      highest: null,
      lowest: null,
    })
  })
})

describe('streaks, 2025 season', () => {
  const all = streaks(season2025, AFTER_SEASON)
  const of = (name: string) => all.find((s) => nameOf(season2025, s.teamId) === name)!

  it('Proof the Curse ran the longest win streak: 7', () => {
    expect(of('Proof the Curse lives once more').longestWin).toBe(7)
  })

  it('FC Slaughterhouse! suffered the longest losing streak: 7', () => {
    expect(of('FC Slaughterhouse!').longestLoss).toBe(7)
  })

  it('Einn ís Kaldal finished the season on a four-game win run', () => {
    const e = of('Einn ís Kaldal')
    expect(e.lastFive).toEqual(['L', 'W', 'W', 'W', 'W'])
    expect(e.current).toEqual({ type: 'W', length: 4 })
  })

  it('a team with no games has no current streak', () => {
    const empty = streaks(season2025, new Date('2025-08-01'))
    for (const s of empty) {
      expect(s.current).toBeNull()
      expect(s.lastFive).toEqual([])
      expect(s.longestWin).toBe(0)
    }
  })
})

describe('formTable, 2025 season', () => {
  const form = formTable(season2025, AFTER_SEASON)

  it('covers gameweeks 30-35', () => {
    expect(form.window).toBe(6)
    expect(form.periods).toEqual([30, 31, 32, 33, 34, 35])
  })

  it('Einn ís Kaldal tops the form table on 5-0-1', () => {
    const top = form.rows[0]
    expect(nameOf(season2025, top.teamId)).toBe('Einn ís Kaldal')
    expect([top.wins, top.draws, top.losses]).toEqual([5, 0, 1])
    expect(top.pointsFor).toBeCloseTo(550.5, 6)
  })

  it('breaks the 2-0-4 logjam by points scored in the window', () => {
    // Five teams finished 2-0-4 over GWs 30-35; window points-for orders them.
    expect(form.rows.slice(5).map((r) => nameOf(season2025, r.teamId))).toEqual([
      'Year of the Diallo', // 719.25
      'Palm Air', // 492.25
      'Haaland, Sakalegur markaskorari', // 473.75
      'les Homms', // 435.5
      'Earth, Wind & Maguire', // 292.5
    ])
  })

  it('shrinks the window honestly early in a season', () => {
    // On 2025-08-30 exactly two gameweeks are settled (verified in ledger tests).
    const early = formTable(season2025, new Date('2025-08-30'))
    expect(early.periods).toEqual([1, 2])
    expect(early.window).toBe(6)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stats/records.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `lib/stats/records.ts`**

```ts
import type { SeasonData, TeamId } from '@/lib/domain/types'
import { auditRegularPeriods, scoresForPeriod } from '@/lib/domain/season'
import { rankTable, type TeamRecord } from './tables'

export interface ScoreExtreme {
  teamId: TeamId
  period: number
  score: number
}

/** Season high and low single-gameweek scores. Earlier period wins a tie. */
export function scoreExtremes(
  season: SeasonData,
  now: Date,
): { highest: ScoreExtreme | null; lowest: ScoreExtreme | null } {
  const { settled } = auditRegularPeriods(season, now)
  let highest: ScoreExtreme | null = null
  let lowest: ScoreExtreme | null = null
  for (const period of settled) {
    for (const [teamId, score] of scoresForPeriod(season, period)) {
      if (highest === null || score > highest.score) highest = { teamId, period, score }
      if (lowest === null || score < lowest.score) lowest = { teamId, period, score }
    }
  }
  return { highest, lowest }
}

export type MatchResult = 'W' | 'D' | 'L'

export interface StreakInfo {
  teamId: TeamId
  longestWin: number
  longestLoss: number
  /** The run the team is on right now; null before any game. */
  current: { type: MatchResult; length: number } | null
  /** Most recent result last. */
  lastFive: MatchResult[]
}

/** Per-team result sequence over real fixtures in settled gameweeks. */
function resultSequence(season: SeasonData, now: Date): Map<TeamId, MatchResult[]> {
  const { settled } = auditRegularPeriods(season, now)
  const seq = new Map<TeamId, MatchResult[]>(season.teams.map((t) => [t.teamId, []]))
  for (const period of settled) {
    for (const f of season.fixtures) {
      if (f.period !== period || f.homeScore === null || f.awayScore === null) continue
      const homeResult: MatchResult =
        f.homeScore > f.awayScore ? 'W' : f.homeScore < f.awayScore ? 'L' : 'D'
      const awayResult: MatchResult =
        homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'D'
      seq.get(f.homeTeamId)?.push(homeResult)
      seq.get(f.awayTeamId)?.push(awayResult)
    }
  }
  return seq
}

export function streaks(season: SeasonData, now: Date): StreakInfo[] {
  return [...resultSequence(season, now).entries()].map(([teamId, results]) => {
    let longestWin = 0
    let longestLoss = 0
    let winRun = 0
    let lossRun = 0
    for (const r of results) {
      winRun = r === 'W' ? winRun + 1 : 0
      lossRun = r === 'L' ? lossRun + 1 : 0
      longestWin = Math.max(longestWin, winRun)
      longestLoss = Math.max(longestLoss, lossRun)
    }
    let current: StreakInfo['current'] = null
    if (results.length > 0) {
      const type = results[results.length - 1]
      let length = 0
      for (let i = results.length - 1; i >= 0 && results[i] === type; i--) length += 1
      current = { type, length }
    }
    return { teamId, longestWin, longestLoss, current, lastFive: results.slice(-5) }
  })
}

export interface FormTable {
  window: number
  /** The settled gameweeks actually covered — fewer than window early on. */
  periods: number[]
  rows: TeamRecord[]
}

/** Rolling mini-league over the last `window` settled gameweeks. */
export function formTable(season: SeasonData, now: Date, window = 6): FormTable {
  const { settled } = auditRegularPeriods(season, now)
  const periods = settled.slice(-window)
  const inWindow = new Set(periods)
  const records = new Map<TeamId, TeamRecord>(
    season.teams.map((t) => [
      t.teamId,
      { teamId: t.teamId, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 },
    ]),
  )
  for (const f of season.fixtures) {
    if (!inWindow.has(f.period) || f.homeScore === null || f.awayScore === null) continue
    for (const [id, mine, theirs] of [
      [f.homeTeamId, f.homeScore, f.awayScore],
      [f.awayTeamId, f.awayScore, f.homeScore],
    ] as const) {
      const r = records.get(id)
      if (!r) continue
      r.games += 1
      r.pointsFor += mine
      r.pointsAgainst += theirs
      if (mine > theirs) r.wins += 1
      else if (mine < theirs) r.losses += 1
      else r.draws += 1
    }
  }
  return { window, periods, rows: rankTable(records) }
}
```

- [ ] **Step 4: Run tests, then the full suite**

Run: `npx vitest run lib/stats/records.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/records.ts lib/stats/records.test.ts
git commit -m "Add score extremes, streaks and rolling form table"
```

---

### Task 12: Distributions, collapses, weekly awards (`lib/stats/records.ts`, completed)

**Files:**
- Modify: `lib/stats/records.ts` (append)
- Test: `lib/stats/records.test.ts` (append)

**Interfaces:**
- Consumes: `auditRegularPeriods`, `scoresForPeriod`.
- Produces:
  - `interface ScoreDistribution { teamId: TeamId; scores: { period: number; score: number }[]; mean: number; stdDev: number }` — population standard deviation; `mean`/`stdDev` are 0 with no scores
  - `scoreDistributions(season: SeasonData, now: Date): ScoreDistribution[]` — sorted `stdDev` desc (boom-or-bust first)
  - `interface Collapse { teamId: TeamId; fromPeriod: number; toPeriod: number; fromScore: number; toScore: number; drop: number }`
  - `biggestCollapses(season: SeasonData, now: Date): Collapse[]` — each team's worst week-on-week drop across consecutive settled gameweek numbers (p, p+1), sorted drop desc; teams with no positive drop or no consecutive pair are omitted
  - `interface WeeklyAwards { period: number; topScore: { teamIds: TeamId[]; score: number }; biggestBlowout: { period: number; winnerId: TeamId; loserId: TeamId; winnerScore: number; loserScore: number; margin: number } | null; unluckiestLoss: { teamId: TeamId; score: number } | null; luckiestWin: { teamId: TeamId; score: number } | null }`
  - `weeklyAwards(season: SeasonData, now: Date): WeeklyAwards[]` — one per settled gameweek, ascending; the decisive-result awards are null in a gameweek where every fixture was drawn

Award definitions: Top Score = highest score (ties share). Biggest Blowout = largest-margin decisive fixture. Unluckiest Loss = highest score that still lost. Luckiest Win = lowest score that still won. These work from gameweek one with no history requirement.

- [ ] **Step 1: Write the failing tests**

Append to `lib/stats/records.test.ts` (add `syntheticSeason`, `SYNTHETIC_SEASON_OVER` imports from `@/test/helpers/synthetic`):

```ts
describe('scoreDistributions, 2025 season', () => {
  const dists = scoreDistributions(season2025, AFTER_SEASON)
  const of = (name: string) => dists.find((d) => nameOf(season2025, d.teamId) === name)!

  it('The Füllkrug Express is the boom-or-bust king: sd 30.65 on mean 103.01', () => {
    expect(nameOf(season2025, dists[0].teamId)).toBe('The Füllkrug Express')
    expect(dists[0].stdDev).toBeCloseTo(30.65, 1)
    expect(dists[0].mean).toBeCloseTo(103.01, 1)
    expect(dists[0].scores).toHaveLength(35)
  })

  it('Proof the Curse is the metronome: sd 23.08', () => {
    expect(of('Proof the Curse lives once more').stdDev).toBeCloseTo(23.08, 1)
  })

  it('scores carry their gameweek for charting', () => {
    const fk = of('The Füllkrug Express')
    expect(fk.scores[0].period).toBe(1)
    expect(fk.scores.map((s) => s.period)).toEqual([...Array(35)].map((_, i) => i + 1))
  })
})

describe('biggestCollapses, 2025 season', () => {
  it('FC Slaughterhouse! fell off a cliff: 156.5 to 41.75 between GW33 and 34', () => {
    const collapses = biggestCollapses(season2025, AFTER_SEASON)
    const worst = collapses[0]
    expect(nameOf(season2025, worst.teamId)).toBe('FC Slaughterhouse!')
    expect(worst.fromPeriod).toBe(33)
    expect(worst.toPeriod).toBe(34)
    expect(worst.fromScore).toBeCloseTo(156.5, 6)
    expect(worst.toScore).toBeCloseTo(41.75, 6)
    expect(worst.drop).toBeCloseTo(114.75, 6)
  })
})

describe('weeklyAwards, 2025 season', () => {
  const awards = weeklyAwards(season2025, AFTER_SEASON)

  it('hands out awards for all 35 gameweeks', () => {
    expect(awards).toHaveLength(35)
    expect(awards.map((a) => a.period)).toEqual([...Array(35)].map((_, i) => i + 1))
  })

  it('gameweek 1: Haaland tops on 143', () => {
    const gw1 = awards[0]
    expect(gw1.topScore.score).toBeCloseTo(143, 6)
    expect(gw1.topScore.teamIds.map((id) => nameOf(season2025, id))).toEqual([
      'Haaland, Sakalegur markaskorari',
    ])
  })

  it('gameweek 1: les Homms blew out Palm Air by 41.75', () => {
    const b = awards[0].biggestBlowout!
    expect(nameOf(season2025, b.winnerId)).toBe('les Homms')
    expect(nameOf(season2025, b.loserId)).toBe('Palm Air')
    expect(b.winnerScore).toBeCloseTo(97.5, 6)
    expect(b.loserScore).toBeCloseTo(55.75, 6)
    expect(b.margin).toBeCloseTo(41.75, 6)
  })

  it('gameweek 1: Füllkrug scored 123.25 and still lost; EWM won with 82.5', () => {
    expect(nameOf(season2025, awards[0].unluckiestLoss!.teamId)).toBe('The Füllkrug Express')
    expect(awards[0].unluckiestLoss!.score).toBeCloseTo(123.25, 6)
    expect(nameOf(season2025, awards[0].luckiestWin!.teamId)).toBe('Earth, Wind & Maguire')
    expect(awards[0].luckiestWin!.score).toBeCloseTo(82.5, 6)
  })

  it('gameweek 16: the tied top score is shared', () => {
    const gw16 = awards[15]
    expect(gw16.topScore.teamIds).toHaveLength(2)
    expect(gw16.topScore.score).toBeCloseTo(114.25, 6)
  })

  it('an all-drawn gameweek has a top score but no decisive awards', () => {
    const season = syntheticSeason({
      fixtures: [
        { period: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 50, awayScore: 50 },
        { period: 1, homeTeamId: 'C', awayTeamId: 'D', homeScore: 60, awayScore: 60 },
      ],
    })
    const a = weeklyAwards(season, SYNTHETIC_SEASON_OVER)
    expect(a).toHaveLength(1)
    expect(a[0].topScore.teamIds.sort()).toEqual(['C', 'D'])
    expect(a[0].biggestBlowout).toBeNull()
    expect(a[0].unluckiestLoss).toBeNull()
    expect(a[0].luckiestWin).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stats/records.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement (append to `lib/stats/records.ts`)**

```ts
export interface ScoreDistribution {
  teamId: TeamId
  scores: { period: number; score: number }[]
  mean: number
  /** Population standard deviation. High = boom-or-bust, low = metronome. */
  stdDev: number
}

export function scoreDistributions(season: SeasonData, now: Date): ScoreDistribution[] {
  const { settled } = auditRegularPeriods(season, now)
  const byTeam = new Map<TeamId, { period: number; score: number }[]>(
    season.teams.map((t) => [t.teamId, []]),
  )
  for (const period of settled) {
    for (const [teamId, score] of scoresForPeriod(season, period)) {
      byTeam.get(teamId)?.push({ period, score })
    }
  }
  return [...byTeam.entries()]
    .map(([teamId, scores]) => {
      const n = scores.length
      const mean = n ? scores.reduce((s, x) => s + x.score, 0) / n : 0
      const stdDev = n
        ? Math.sqrt(scores.reduce((s, x) => s + (x.score - mean) ** 2, 0) / n)
        : 0
      return { teamId, scores, mean, stdDev }
    })
    .sort((a, b) => b.stdDev - a.stdDev || a.teamId.localeCompare(b.teamId))
}

export interface Collapse {
  teamId: TeamId
  fromPeriod: number
  toPeriod: number
  fromScore: number
  toScore: number
  drop: number
}

/** Each team's worst week-on-week fall, biggest first. */
export function biggestCollapses(season: SeasonData, now: Date): Collapse[] {
  const { settled } = auditRegularPeriods(season, now)
  const scoresByPeriod = new Map(settled.map((p) => [p, scoresForPeriod(season, p)]))
  const out: Collapse[] = []
  for (const team of season.teams) {
    let worst: Collapse | null = null
    for (const p of settled) {
      if (!scoresByPeriod.has(p + 1)) continue
      const from = scoresByPeriod.get(p)?.get(team.teamId)
      const to = scoresByPeriod.get(p + 1)?.get(team.teamId)
      if (from === undefined || to === undefined) continue
      const drop = from - to
      if (drop > 0 && (worst === null || drop > worst.drop)) {
        worst = { teamId: team.teamId, fromPeriod: p, toPeriod: p + 1, fromScore: from, toScore: to, drop }
      }
    }
    if (worst) out.push(worst)
  }
  return out.sort((a, b) => b.drop - a.drop || a.teamId.localeCompare(b.teamId))
}

export interface WeeklyAwards {
  period: number
  /** Ties share the honour, exactly like the prize ledger. */
  topScore: { teamIds: TeamId[]; score: number }
  biggestBlowout: {
    period: number
    winnerId: TeamId
    loserId: TeamId
    winnerScore: number
    loserScore: number
    margin: number
  } | null
  /** Highest score that still lost. */
  unluckiestLoss: { teamId: TeamId; score: number } | null
  /** Lowest score that still won. */
  luckiestWin: { teamId: TeamId; score: number } | null
}

/** Auto-generated gameweek honours. Work from gameweek one, no history needed. */
export function weeklyAwards(season: SeasonData, now: Date): WeeklyAwards[] {
  const { settled } = auditRegularPeriods(season, now)
  return settled.map((period) => {
    const scores = scoresForPeriod(season, period)
    const top = Math.max(...scores.values())
    const topIds = [...scores.entries()].filter(([, v]) => v === top).map(([id]) => id)

    let blowout: WeeklyAwards['biggestBlowout'] = null
    let unluckiest: WeeklyAwards['unluckiestLoss'] = null
    let luckiest: WeeklyAwards['luckiestWin'] = null
    for (const f of season.fixtures) {
      if (f.period !== period || f.homeScore === null || f.awayScore === null) continue
      if (f.homeScore === f.awayScore) continue
      const [winnerId, winnerScore, loserId, loserScore] =
        f.homeScore > f.awayScore
          ? [f.homeTeamId, f.homeScore, f.awayTeamId, f.awayScore]
          : [f.awayTeamId, f.awayScore, f.homeTeamId, f.homeScore]
      const margin = winnerScore - loserScore
      if (blowout === null || margin > blowout.margin) {
        blowout = { period, winnerId, loserId, winnerScore, loserScore, margin }
      }
      if (unluckiest === null || loserScore > unluckiest.score) {
        unluckiest = { teamId: loserId, score: loserScore }
      }
      if (luckiest === null || winnerScore < luckiest.score) {
        luckiest = { teamId: winnerId, score: winnerScore }
      }
    }
    return {
      period,
      topScore: { teamIds: topIds, score: top },
      biggestBlowout: blowout,
      unluckiestLoss: unluckiest,
      luckiestWin: luckiest,
    }
  })
}
```

- [ ] **Step 4: Run tests, then the full suite**

Run: `npx vitest run lib/stats/records.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/records.ts lib/stats/records.test.ts
git commit -m "Add score distributions, collapses and weekly awards"
```

---

### Task 13: Power rankings (`lib/stats/power.ts`)

**Files:**
- Create: `lib/stats/power.ts`
- Test: `lib/stats/power.test.ts`

**Interfaces:**
- Consumes: `auditRegularPeriods`, `scoresForPeriod`.
- Produces:
  - `POWER_WEIGHTS = { real: 0.4, allPlay: 0.4, form: 0.2 } as const`
  - `interface PowerRanking { teamId: TeamId; score: number; rank: number; previousRank: number | null; movement: number | null }` — `movement` = `previousRank - rank` (positive = climbing); null when fewer than two settled gameweeks exist
  - `powerRankings(season: SeasonData, now: Date, formWindow?: number): PowerRanking[]` — rank ascending; `[]` with no settled gameweeks

Formula (fixed — the blend the spec asks for, weights chosen and locked here): each component is a win percentage in [0, 1] over settled gameweeks — real-record win points ÷ games, all-play points ÷ games, form win points ÷ games over the last `min(formWindow, settled)` gameweeks (default 6). `score = 0.4·real + 0.4·allPlay + 0.2·form`. Ties break by total real points-for, then teamId. `previousRank` recomputes the whole thing on settled gameweeks minus the most recent one.

- [ ] **Step 1: Write the failing tests**

Create `lib/stats/power.test.ts` with the same fixture-loading preamble (`load`, `season2025`, `AFTER_SEASON`, `nameOf`), importing from `@/lib/stats/power`:

```ts
describe('powerRankings, 2025 season', () => {
  const power = powerRankings(season2025, AFTER_SEASON)

  it('ranks the league after gameweek 35', () => {
    expect(power.map((p) => nameOf(season2025, p.teamId))).toEqual([
      'Einn ís Kaldal',
      'Leibbi davíðs',
      'The Füllkrug Express',
      'Proof the Curse lives once more',
      'les Homms',
      'Year of the Diallo',
      'FC Slaughterhouse!',
      'Haaland, Sakalegur markaskorari',
      'Palm Air',
      'Earth, Wind & Maguire',
    ])
    expect(power.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('computes the blended score: Einn ís Kaldal at 0.6606', () => {
    expect(power[0].score).toBeCloseTo(0.6606, 3)
  })

  it('tracks weekly movement: Proof climbed past les Homms in the final week', () => {
    const proof = power.find((p) => nameOf(season2025, p.teamId) === 'Proof the Curse lives once more')!
    expect(proof.previousRank).toBe(5)
    expect(proof.movement).toBe(1)
    const homms = power.find((p) => nameOf(season2025, p.teamId) === 'les Homms')!
    expect(homms.previousRank).toBe(4)
    expect(homms.movement).toBe(-1)
  })

  it('is empty with no settled gameweeks', () => {
    expect(powerRankings(season2025, new Date('2025-08-01'))).toEqual([])
  })

  it('has null movement when only one gameweek exists', () => {
    // Period 1 ends 2025-08-22; only it is settled on 2025-08-23.
    const single = powerRankings(season2025, new Date('2025-08-23'))
    expect(single).toHaveLength(10)
    for (const p of single) {
      expect(p.previousRank).toBeNull()
      expect(p.movement).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stats/power.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `lib/stats/power.ts`**

```ts
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
```

- [ ] **Step 4: Run tests, then the full suite**

Run: `npx vitest run lib/stats/power.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/power.ts lib/stats/power.test.ts
git commit -m "Add blended power rankings with weekly movement"
```

---

## Phase 4 — Page redesign

**This phase works differently.** Tasks 1–13 were transcription plus verification; design cannot be specified that way. Each task below fixes the *requirements, structure, data contracts and verification steps* verbatim, and leaves visual judgement to the implementer, who must:

- **Load the `frontend-design` skill before writing any UI code** (every task in this phase).
- Iterate visually: run the dev server (`npm run dev`, lands on **http://localhost:3001**), look at the page in a browser at **375 px width first**, then desktop. Screenshot before claiming done.
- Remember the live 2026 season is currently pre-season/early season — the page you see is the *empty/partial state*, which is a feature: constraint 2 gets exercised for real. The full-data state is verified on `/season/2025`.

**Locked design decisions (correctness requirements from the spec, not preferences):**

1. **Commit to light unconditionally.** The app paints its own light background (`color-scheme: light`, explicit background token on `body`) and never branches on `prefers-color-scheme`. This is the spec's sanctioned alternative to dual-mode verification, and it removes the class of bug that made the 2025 hypothetical disclaimer invisible. One palette, one set of contrast checks. Accepted cost: a reader on a dark-mode phone gets a bright page.

   **Accents are re-derived for a light background, not translated from a dark one.** A bright gold and a bright sky blue — the natural dark-treatment accents — both fail WCAG AA on light. Token set (contrast measured against the `#FAFAF8` paper unless noted):

   | Token | Value | Role | Contrast |
   |---|---|---|---|
   | `--paper` | `#FAFAF8` | page background | — |
   | `--surface` | `#FFFFFF` | cards, table stripes | — |
   | `--line` | `#E5E4DF` | hairline borders | — |
   | `--ink` | `#1A1A18` | body text | 16.1:1 |
   | `--muted` | `#6B6B63` | captions, secondary | 5.4:1 |
   | `--money` | `#B45309` | ISK, prize winners | 5.3:1 |
   | `--analysis` | `#0369A1` | luck, expected, analytical | 5.7:1 |
   | `--down` | `#B91C1C` | negative / falling | 6.2:1 |
   | `--up` | `#15803D` | positive / rising | 4.9:1 |
   | `--warn-bg` / `--warn-ink` | `#FFFBEB` / `#92400E` | hypothetical disclaimer | 7.0:1 (ink on warn-bg) |

   These are starting values, not sacred — the implementer may tune during visual iteration, but **any replacement must be measured, and no text token may drop below 4.5:1 against the surface it sits on.** Red/green still only ever appear paired with a sign or arrow so nothing depends on colour alone. The hypothetical disclaimer and all ISK figures must pass WCAG AA against their painted backgrounds (spot-check with browser devtools and record the ratio).
2. **Empty and partial states are first-class.** Every stat component receives enough data to know how many settled gameweeks exist and renders an honest "Needs N more gameweeks" state instead of a confident wrong number (thresholds below).
3. **Twenty stats must not arrive as twenty tables.** Front page = ledger, table, this week's awards. Everything deeper lives one click away on the season page, and each stat family gets a distinct visual treatment (bars, matrix, chart, cards) rather than uniform tables.
4. **Phone first, desktop second — but desktop is its own layout.** 375 px is the primary target. Desktop is not the phone layout stretched: the content container goes to ~1200 px (prose blocks stay capped near 70ch so line length remains readable), and content that is naturally parallel sits side by side rather than stacked. Minimum bar for "uses the screen": on the front page the ledger and league table share a row and the awards strip is 4-across; on the season page the two alternate-universe tables sit side by side and the luck index sits beside the all-play record. Everything collapses to the phone stack below `md`.

**Direction: editorial data magazine.** Light, open, confident with numbers — a well-set stats page in a good sports magazine, not a TV graphics package.

*Kept* (this is the information design, and it is what makes twenty stats scannable): team crests (`Team.logoUrl`, existing `<img>` pattern with the eslint-disable comment), large tabular numerals as the focal element of every card, award cards, form arrows (▲ ▼ —), score-bat framing for head-to-head numbers.

*Dropped* (this was the skin): the dark stadium palette, heavy condensed capitals as the default voice, and animated number count-ups. Dropping count-ups also deletes a client component, an IntersectionObserver, and a `prefers-reduced-motion` code path — take the simplification.

*Typography:* body and UI stay Geist; `Geist Mono` remains available for tabular figures. Add exactly one display face via `next/font/google`, used only for the masthead, section headings and headline stat numerals. `Barlow Condensed` is out. Pick during visual iteration from: `Fraunces` (variable serif, characterful), `Instrument Serif` (editorial, high contrast), `Bricolage Grotesque` (variable grotesque, playful), or `Archivo` (sturdy, neutral). One face, subset `latin`, and it must render Icelandic characters (á é í ó ú ý þ æ ö ð) correctly — check against real team names before committing to it. Everything else earns hierarchy from scale, weight, tracking and whitespace.

**Voice: English, full trash talk.** The page is built to be dropped in a group chat. Locked copy (use exactly these award/stat titles; body copy in the same register):

| Stat | Title / copy |
|---|---|
| Weekly top score | "Top Score" |
| Biggest blowout | "The Massacre" — "X put N on Y" |
| Unluckiest loss | "Robbed" — "Scored N. Still lost. Brutal." |
| Luckiest win | "Daylight Robbery" — "Won with N. Shameless." |
| Luck index positive | "+N wins the schedule gifted" |
| Luck index negative | "N wins the schedule stole" |
| Biggest collapse | "Bottled It" |
| Boom-or-bust | "Boom or Bust" / metronome end: "The Metronome" |
| Nemesis | "Nemesis" — "Can't buy a win against them" |
| Bunny | "Bunny" — "Free points since 2025" |
| Revenge fixture | "Revenge Week" — "You owe them one" |
| Schedule swap | "In another universe…" — "Makes playoffs under N of M schedules" |
| Empty state | "Needs N more gameweeks. Patience." |
| 2025 hypothetical | "HYPOTHETICAL — the prize didn't exist in 2025. Nobody owes anybody anything." |

**Unit discipline in copy (amended 2026-08-21).** `LuckEntry.delta` is measured in **win points** (1 per win, 0.5 per draw), not fantasy score points — Year of the Diallo's 2025 delta of −7.5 means seven and a half *wins*. The original copy ("N points the universe owes you") was both vague and wrong about the unit: "points" reads as score points, a completely different magnitude. Any copy for a derived stat must name the unit it is actually in. Render the luck index delta to one decimal place with the word "wins", and carry the mechanism on the sub-line — e.g. "7.5 wins the schedule stole · all-play 21–14: beat most of the league most weeks, drew the wrong opponents."

**Minimum-data gates** (defaults; a task may tune a number during visual iteration but every gated component must show the honest empty state with the real remaining count):

| Component | Needs settled GWs |
|---|---|
| Ledger, weekly awards, tables | 1 |
| Average-threshold trend | 3 |
| Power rankings | 3 (movement arrows from 2) |
| Luck index, all-play, alternate tables side-by-side verdicts | 6 |
| Form table (full window) | 6 (shows shrunken window with label from 1) |
| Boom-or-bust distributions | 8 |
| Schedule swap, close games | 10 |
| Nemesis / bunny | 2 meetings (module-enforced) |

---

### Task 14: Light theme, app shell and information architecture

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Create: `app/season/[year]/page.tsx`, `app/components/SiteNav.tsx`, `app/components/EmptyState.tsx`, `app/components/SectionHeader.tsx`
- Create: `app/lib/season-view.ts`

**Interfaces:**
- Consumes: `loadSeason`, `prizeRuleApplies`, `SEASON_YEARS`, `CURRENT_SEASON` from existing config/loaders; `auditRegularPeriods`.
- Produces (later UI tasks build on these exact exports):
  - `app/lib/season-view.ts`: `interface SeasonView { year: number; season: SeasonData; settled: number[]; hypothetical: boolean }` and `loadSeasonView(year: number, now: Date): Promise<SeasonView>` (wraps `loadSeason` + `auditRegularPeriods` + `prizeRuleApplies` so page components never call the raw pieces)
  - `<EmptyState needed={n} have={m} what="Luck needs a sample" />` — renders the locked "Needs N more gameweeks. Patience." copy with `N = needed - have`; renders nothing (returns children) when `have >= needed` is the caller's job — EmptyState itself is purely presentational
  - `<SectionHeader title subtitle />` — display-face section heading with a muted subtitle
  - `<SiteNav />` — links to `/` and each season's page
  - Route `/season/[year]` exists and 404s (`notFound()`) on years not in `SEASON_YEARS`

Steps:

- [ ] **Step 1:** Load the `frontend-design` skill. Read the current `app/` files.
- [ ] **Step 2:** Add the chosen display face (variable `--font-display`) to `app/layout.tsx` alongside the existing Geist fonts — verify it renders Icelandic characters against a real team name before settling on it. In `app/globals.css`, define the light-committed token set from the locked-decision table (`--paper`, `--surface`, `--line`, `--ink`, `--muted`, `--money`, `--analysis`, `--up`, `--down`, `--warn-bg`, `--warn-ink`) as CSS variables on `:root`, set `color-scheme: light`, paint `body` with `--paper`, and wire the tokens plus `--font-display` into the Tailwind v4 `@theme` block. Delete the existing dark `--background`/`--foreground` pair and the comment above it, and any `prefers-color-scheme` branching. Define the layout container here too: a single `.container-page` (or Tailwind `@theme` width token) capping content at ~1200 px with responsive gutters, plus a `.prose-measure` cap near 70ch for paragraph text.
- [ ] **Step 3:** Create `app/lib/season-view.ts`, `SiteNav`, `SectionHeader`, `EmptyState` per the interfaces above. Restructure `app/page.tsx` to render the shell: nav, an editorial masthead for "170 Broskis" in the display face, and — for now — the existing `LedgerTable`/`GameweekHistory` content for the current season only (2025 moves to its season page; keep the hypothetical banner logic intact wherever a 2025 ledger renders). Create `app/season/[year]/page.tsx` rendering the same ledger content for that year plus placeholder section anchors (`#luck`, `#rivalries`, `#records`) that tasks 16–18 fill.
- [ ] **Step 4:** Verify in the browser at 375 px and at 1440 px: light background everywhere with no dark remnant and no `prefers-color-scheme` flip (test with the OS/devtools set to dark — the page must not change), fonts loading, Icelandic characters correct, nav works, the container actually reaches ~1200 px on desktop rather than staying at the old 768 px, `/season/2025` shows the full-data ledger with the hypothetical banner clearly legible, `/season/1999` 404s. Screenshot both routes at both widths.
- [ ] **Step 5:** Run `npm test` (must stay green) and `npx next lint --no-cache` if configured (`npm run lint` otherwise). Commit:

```bash
git add app/
git commit -m "Light theme foundation: committed light shell, nav, season routes"
```

---

### Task 15: Front page — masthead, ledger, table, this week's awards

**Files:**
- Modify: `app/page.tsx`, `app/components/LedgerTable.tsx`, `app/components/GameweekHistory.tsx`
- Create: `app/components/AwardsStrip.tsx`, `app/components/LeagueTable.tsx`

**Interfaces:**
- Consumes: `SeasonView` (Task 14), `computeLedger`, `combinedRecords` + `rankTable` + `winPoints` (Task 4), `weeklyAwards` (Task 12), `streaks` (Task 11, for form arrows in the table).
- Produces:
  - `<LeagueTable view={SeasonView} />` — the combined (official) table with crests, W-D-L, points-for, and a form-arrow column from each team's current streak
  - `<AwardsStrip view={SeasonView} />` — the most recent settled gameweek's four awards as cards using the locked copy, crest + large display numeral on `--surface` with a `--line` hairline; stacked on phone, 4-across from `md` up; renders the empty state when no gameweek is settled

Front page composition, in one DOM order that holds at every width — **no CSS reordering between phone and desktop**, so the reading order a screen reader or keyboard user gets is the order everyone sees: masthead with league name + "as of" line; the prize ledger (restyled `LedgerTable`: `--money` accent on ISK, crests, no animation, with `GameweekHistory` behind its `<details>` fold); `LeagueTable`; `AwardsStrip` for this week; a link row into `/season/[year]` ("The deep cuts →").

The desktop layout is that same order in a real grid rather than the stack widened: **ledger and `LeagueTable` share a row from `lg` up** (ledger left, table right — they are the two "what happened" views of one season and reading them together is the point), and the awards strip runs 4-across as its own full-width band beneath. The ledger leads at both widths because the money view is the reason the page exists; the awards are the timely extra, not the headline. All money figures and the withheld-gameweeks warning must remain as legible as the Task 14 disclaimer standard.

Steps:

- [ ] **Step 1:** Load the `frontend-design` skill. Build `AwardsStrip` and `LeagueTable` against `SeasonView`.
- [ ] **Step 2:** Restyle `LedgerTable`/`GameweekHistory` onto the light tokens. Compose the front page — phone stack first, then the desktop grid.
- [ ] **Step 3:** Verify at 375 px: no horizontal scroll, table fits (crest + short name on phone via `Team.shortName ?? name`), awards cards stack cleanly. Then verify at 1440 px: ledger and league table genuinely side by side, awards 4-across, no ocean of empty gutter, no table row stretched to absurd column widths. Verify the live empty state (2026 pre-season): ledger shows its existing "fills in from gameweek 1" state, awards strip shows the honest empty state — check the empty state at both widths, since a 4-across grid of empty cards is its own design problem. Verify `/season/2025` still renders. Screenshot phone + desktop.
- [ ] **Step 4:** `npm test` green. Commit:

```bash
git add app/
git commit -m "Front page: ledger, official table, weekly awards"
```

---

### Task 16: Season page — luck vs. skill section

**Files:**
- Modify: `app/season/[year]/page.tsx`
- Create: `app/components/luck/AlternateTables.tsx`, `app/components/luck/LuckIndex.tsx`, `app/components/luck/ScheduleSwap.tsx`, `app/components/luck/CloseGames.tsx`, `app/components/luck/ThresholdTrend.tsx`

**Interfaces:**
- Consumes: `SeasonView`; Task 4 tables; Task 5 `allPlayRecords` + `luckIndex`; Task 6 `scheduleSwap`; Task 7 `pointsAgainstTable` + `closeGameRecords` + `averageThresholds` + Task 4 `averageRecords` (clears-the-bar counts).
- Produces: the `#luck` section of the season page. No new lib code — **if a component needs a computation, it belongs in `lib/stats/`, not in a component**.

Composition (each block gated per the minimum-data table, each with a one-line trash-talk verdict):
- **AlternateTables**: real-only vs average-only tables genuinely side by side from `md` up (stacked on phone), rows that change position get movement badges; verdict line names the biggest riser/faller between the two.
- **LuckIndex**: horizontal diverging bar per team, zero-centred — positive bars in `--money` labelled "+N wins the schedule gifted", negative bars in `--analysis` labelled "N wins the schedule stole" (one decimal, unit named; see the unit-discipline note in the phase preamble). Sorted luckiest first, all-play record as the sub-line. On desktop it shares a row with the all-play record block rather than sitting alone in a 1200 px column.
- **ScheduleSwap**: "In another universe…" cards — "Makes playoffs under N of M schedules"; include points-against + losses-to-top-score as the "hardest slate" sub-stat.
- **CloseGames**: nail-biter records with the derived threshold surfaced in the caption ("games decided by ≤ N — the league's own bottom quartile").
- **ThresholdTrend**: the average-threshold series as a simple inline SVG line/spark chart (no chart library — plot points, stroke the path, label first/last), plus "clears the bar most" from `averageRecords`.

Steps:

- [ ] **Step 1:** Load the `frontend-design` skill. Build the five components against `/season/2025` (full data).
- [ ] **Step 2:** Wire into the season page under a `SectionHeader` ("Luck vs. Skill" / "Who earned it, who fluked it").
- [ ] **Step 3:** Verify at 375 px on `/season/2025` (real numbers: Diallo −7.5, les Homms 9-of-9 swaps, Einn ís 9-0-0 in close games should all be visible and legible). Verify the gated empty states on the live 2026 page. Screenshot both.
- [ ] **Step 4:** `npm test` green. Commit:

```bash
git add app/
git commit -m "Luck vs skill section: alternate tables, luck index, swaps, close games, threshold"
```

---

### Task 17: Season page — rivalries section

**Files:**
- Modify: `app/season/[year]/page.tsx`
- Create: `app/components/rivalries/H2HMatrix.tsx`, `app/components/rivalries/NemesisBunny.tsx`, `app/components/rivalries/RevengeWeek.tsx`
- Modify: `app/lib/season-view.ts` (add `loadAllSeasonViews(now: Date): Promise<SeasonView[]>` — `Promise.allSettled` over `SEASON_YEARS`, returning the fulfilled views; rivalries span seasons, so this section consumes **all** loaded seasons regardless of which season page it sits on)

**Interfaces:**
- Consumes: Task 8 `resolveManagers` (+ `MANAGER_OVERRIDES` by default), Task 9 `headToHeadMatrix` + `nemesisAndBunny`, Task 10 `revengeFixtures`.
- Produces: the `#rivalries` section. The section header states its cross-season nature ("2025 + 2026 combined — old wounds count").

Composition:
- **H2HMatrix**: manager × manager grid, cells colour-scaled by aggregate margin on a light diverging scale (`--money` tint → `--paper` at neutral → `--analysis` tint; tints only, so cell text stays ≥ 4.5:1 at every step of the scale — verify the darkest cell, not just the midpoint), tap/click expands a cell into the meeting list (client component with `<details>` or state) — each meeting a score-bat row "GW12 '25 · 101.5 – 88.25". On phone, the matrix scrolls horizontally inside its own container with sticky first column — the one sanctioned horizontal scroller.
- **NemesisBunny**: one card per returning manager: crest, "Nemesis: X (−N per meeting)", "Bunny: Y (+N per meeting)", using the locked copy; single-season managers listed under "New blood — no history yet".
- **RevengeWeek**: upcoming revenge fixtures ("Revenge Week — You owe them one"), showing the last-meeting scoreline; honest empty state when none.
- Unmatched/single-season managers must be visible (constraint from the spec: surfaced explicitly, never silently dropped).

Steps:

- [ ] **Step 1:** Load the `frontend-design` skill. Add `loadAllSeasonViews`. Build the three components; drive them with all fulfilled season views + `resolveManagers`.
- [ ] **Step 2:** Wire into the season page under `SectionHeader` ("Rivalries" / "Some beatings are personal").
- [ ] **Step 3:** Verify on `/season/2025` at 375 px: matrix scrolls in-container (page body must not scroll horizontally), cells expand, nemesis/bunny values match the tested numbers (Füllkrug nemesis Proof −4.13). On the live page, 2026 meetings don't exist yet — verify rivalries still render from 2025 data alone and revenge fixtures show either real upcoming fixtures or the empty state. Screenshot.
- [ ] **Step 4:** `npm test` green. Commit:

```bash
git add app/
git commit -m "Rivalries section: h2h matrix, nemesis and bunny, revenge week"
```

---

### Task 18: Season page — records, superlatives and power rankings

**Files:**
- Modify: `app/season/[year]/page.tsx`
- Create: `app/components/records/RecordsWall.tsx`, `app/components/records/FormTable.tsx`, `app/components/records/BoomOrBust.tsx`, `app/components/records/PowerRankings.tsx`

**Interfaces:**
- Consumes: Task 11 `scoreExtremes` + `streaks` + `formTable`, Task 12 `scoreDistributions` + `biggestCollapses` + `weeklyAwards`, Task 13 `powerRankings`.
- Produces: the `#records` section.

Composition:
- **RecordsWall**: superlative cards — season high/low, longest win/loss streaks (holder + count), "Bottled It" (biggest collapse, with the from→to scores), each a large display numeral with crest on a `--surface` card. Grid: one column on phone, two from `md`, three from `lg`.
- **FormTable**: last-6 mini-league with the window's gameweeks in the caption; shrunken-window label when fewer than 6 exist.
- **BoomOrBust**: per-team score strip chart (inline SVG dots per gameweek on a shared scale) with mean line and stdDev figure; sorted boom-or-bust first, "The Metronome" tag on the lowest-variance team.
- **PowerRankings**: ranked list with blended score bar and movement arrows (▲ N / ▼ N / —) from `movement`.

Steps:

- [ ] **Step 1:** Load the `frontend-design` skill. Build the four components against `/season/2025`.
- [ ] **Step 2:** Wire into the season page under `SectionHeader` ("Records & Power" / "The wall of fame and shame").
- [ ] **Step 3:** Verify at 375 px on `/season/2025` (Leibbi 173.5 high, Slaughterhouse's 156.5→41.75 collapse, Füllkrug top of boom-or-bust) and the gated empty states on live 2026. Screenshot.
- [ ] **Step 4:** `npm test` green. Commit:

```bash
git add app/
git commit -m "Records section: superlatives wall, form, boom-or-bust, power rankings"
```

---

### Task 19: Full-page verification pass

**Files:**
- Modify: whatever the findings demand (fixes only — no new features)
- Modify: `docs/superpowers/follow-ups.md` (append anything observed-but-deferred)

This is the task where "a design that only looks good full of data is not finished" gets enforced. No new UI; a checklist executed against the running app, with fixes applied in place.

- [ ] **Step 1: Phone pass.** 375 px viewport on `/`, `/season/2025`, `/season/2026`: no page-level horizontal scroll anywhere (the h2h matrix scrolls only inside its container); tap targets ≥ 44 px; text ≥ 12 px.
- [ ] **Step 2: Money pass.** On every view where ISK renders: figures legible, the 2025 hypothetical banner unmissable (top of the ledger, not collapsed, contrast-checked with devtools against its painted background — record the ratio, must be ≥ 4.5:1). The withheld-gameweeks warning renders when `periodsWithheld > 0` (force it by viewing code paths with a synthetic date if needed — do not fake data into the page).
- [ ] **Step 3: Empty/partial pass.** The live 2026 page is the real empty state: every gated component shows "Needs N more gameweeks. Patience." with a correct N, and nothing renders a confident number from too little data. Check the boundary: a component gated at 6 must gate at 5 settled gameweeks and render at 6 (temporarily pass an earlier `now` to `loadSeasonView` **in a scratch check, then revert** — `now` flows as a parameter precisely so this is possible).
- [ ] **Step 4: Theme and desktop pass.** With the OS/devtools colour scheme set to **dark**, every route must render identically to light mode — no token flips, no `prefers-color-scheme` rule anywhere (`grep -rn "prefers-color-scheme" app/` must return nothing). Then at 1440 px on `/`, `/season/2025`, `/season/2026`: the container reaches ~1200 px, the paired layouts from tasks 15-18 are actually side by side, no paragraph runs past ~70ch, and no section is a lone narrow column in a wide empty page. Any remaining motion must respect `prefers-reduced-motion: reduce`.
- [ ] **Step 5: Failure pass.** One season failing to load must not take down the page (existing `Promise.allSettled` pattern — verify the rejected branch renders the unavailable notice in the new design).
- [ ] **Step 6:** `npm test` green, `npm run build` succeeds (production build catches server/client component mistakes). Screenshot the final front page and season page, phone + desktop.
- [ ] **Step 7:** Append to `docs/superpowers/follow-ups.md`: the 2026 GW1 fixture capture reminder (still pending — capture the schedule response as soon as gameweek 1 settles, while a partially-settled gameweek can still be observed), plus anything deferred from this pass. Commit:

```bash
git add -A
git commit -m "UI verification pass: phone, desktop, money, empty states, theme"
```

---

## Execution notes

- Tasks 1→2→3 are strictly sequential (each builds on the previous). Tasks 4→(5,6,7) are sequential within `luck.ts`; Task 8→(9→10); 11→12; 13 needs only Task 1. Phase 4 needs all stats done and is sequential 14→15→16→17→18→19.
- Every stat task ends with the full suite green — a task that breaks the ledger tests is wrong by definition.
- The dev server may already be running on 3001 from a previous session; reuse it rather than spawning a second one.
