# 170 Broskis — League Stats Page

**Date:** 2026-08-20
**Status:** Design approved, pending spec review

## Purpose

A public web page for the "170 Broskis" Fantrax Premier League draft league that shows
stats the Fantrax UI does not: prize-money tracking, luck-vs-skill separation, rivalry
records, and weekly superlatives. Shared with the whole league via a URL.

## Verified facts

All facts below were confirmed by probing live endpoints on 2026-08-20, not assumed.

### League identity

| | |
|---|---|
| League name | 170 Broskis |
| `leagueHistoryId` | `6yst2cj3l5tiizya` (stable across seasons) |
| 2026 season `leagueId` | `ywhebyp7msyix1sj` — 14 teams |
| 2025 season `leagueId` | `7he4pkgpme8uz58b` — 10 teams |
| Scoring type | `HEAD_TO_HEAD_POINTS_BASED` |
| Periods | 38; regular season 1–35, playoffs 36–38, 7 of 14 qualify |
| Roster | 14 players: 11 active (max 1 G, 5 D, 5 M, 3 F) + 3 reserve |
| 2026 season dates | 2026-08-21 → 2027-05-30 |
| 2026 draft | Snake, completed 2026-08-19 |

### Match format — the critical structural finding

Each team plays **two fixtures per gameweek**: one against a real opponent, and one
against `*League Average*` (the arithmetic mean of all team scores that gameweek,
verified exactly against GW1 2025: mean of ten scores = 101.15).

This yields 70 games over 35 gameweeks, matching observed records (e.g. 43-1-26).

Consequence: `getLeagueInfo`'s `matchupList` contains N/2 real matchups **plus** N
league-average rows whose `home` object is empty. 2026: 21 rows = 7 real + 14 average.
These rows are **not** malformed data and must not be discarded — they are half of
every team's record.

### Data access

The league has "Allow public to view league" enabled, so **no authentication is
required**. No cookies, no stored secrets, no expiry, no re-auth. This was a deliberate
design decision: the alternative (private league + stored session cookie) was rejected
because it introduces a rotating secret and a silent-staleness failure mode.

Confirmed endpoints:

| Endpoint | Method | Returns |
|---|---|---|
| `fxea/general/getLeagueInfo?leagueId=` | GET | Schedule (all 38 periods), scoring rules, teams, playoff config, roster constraints |
| `fxea/general/getStandings?leagueId=` | GET | Rank, W-D-L string, `totalPointsFor`, win% |
| `fxea/general/getDraftResults?leagueId=` | GET | Every pick: round, pick, `teamId`, `playerId`, timestamp |
| `fxea/general/getTeamRosters?leagueId=&period=N` | GET | Roster per team with `ACTIVE`/`RESERVE` status |
| `fxea/general/getPlayerIds?sport=EPL` | GET | Player names, real club, position. **Sport code is `EPL`** — `SOCCER` and `PL` both return `INVALID_SPORT` |
| `fxpa/req` | POST | `getStandings` with `view: "SCHEDULE"` returns **all 35 gameweeks of matchup scores in one call** |
| `fxpa/req` | POST | `getTeamRosterInfo` with `fantasyTeamId` + `period` returns per-player stats. Note: param is `fantasyTeamId`, not `teamId` |

Per-player figures from `getTeamRosterInfo` are **cumulative to date**, not per-period.
Weekly values require differencing consecutive periods — roughly 500 requests to
backfill a season. See Out of Scope.

### 2025 season outcome (drives the product case)

| Rank | Team | Record | FPts |
|---|---|---|---|
| 1 | Leibbi davíðs | 43-1-26 | 6944 (4th most) |
| 2 | Einn ís Kaldal | 42-0-28 | 6669 |
| 3 | The Füllkrug Express | 41-0-29 | **7211 (most)** |
| 5 | Year of the Diallo | 35-0-35 | **7055 (2nd most)** |

The two highest-scoring teams finished 3rd and 5th. Draws are near-nonexistent (2 in a
full season), so draw handling stays trivial.

Eight of 2025's ten teams return in 2026; two (Palm Air, Earth Wind & Maguire) left, six
joined.

## Scope

### In scope

1. **Prize ledger** (headline feature)
2. **Luck vs. skill**
3. **Rivalries and head-to-head**
4. **Records and superlatives**
5. **Both seasons** — 2025 (complete) and 2026 (live)

Every feature in scope is computable from team-level gameweek scores plus the schedule,
both of which arrive in two cheap requests per season. Nothing in scope requires
per-player data, storage, or authentication. That is a deliberate boundary, and the
Out of Scope list below is where it was drawn.

### Out of scope

- **Benched-points regret.** Needs per-player weekly scores: ~500 requests per season
  backfill plus a storage layer. Deferred; revisit once the core page proves useful.
- **Draft board / pick-value analysis.** Data is available (`getDraftResults`) but not
  requested. Deferred.
- **Pre-gameweek predictions.** Considered and deliberately dropped. A team-level Monte
  Carlo (matchup odds, odds of beating the League Average, odds of taking the 1500 ISK)
  was designed and costed as roughly a day's work with no storage required, since a
  seeded model using only data through gameweek N-1 is exactly recomputable on demand.
  Rejected for now on two grounds: 2026 has no score history and six of fourteen teams
  are brand new, so early-season output would be close to guessing; and predictions
  sharp enough to be worth reading want player-level projections, which drags in the
  ~500-call backfill and storage layer already cut. Revisit once a season of history
  exists.
- **Playoff odds simulation.** Not requested.
- **Seasons before 2025.** Not investigated.

## Feature specifications

### 1. Prize ledger

League rule, **new for the 2026 season**: the **highest-scoring team of each gameweek
earns 1500 ISK**, accumulating across the season and paid out at season end alongside the
other prizes.

The rule did **not** exist in 2025 and does not apply retroactively. No money was or will
be paid for 2025 gameweek wins. The 2025 figures below are hypothetical — a
"what it would have paid" retrospective — and every 2025 ledger view in the UI must be
labelled as such, unambiguously, so nobody reads it as an outstanding debt.

Rules as confirmed by the commissioner:

- **Range:** regular season only, gameweeks 1–35. Fixed pool of 52,500 ISK.
- **Ties:** split evenly. Two-way tie pays 750 ISK each. N-way tie pays 1500/N each.
  Ties are rare but real — exactly one occurred in 2025's 35 gameweeks.
- **Basis:** the maximum real team score in the gameweek. The `*League Average*` pseudo-
  team is never eligible.
- **Seasons:** 2026 onward. 2025 is computed for display only, never as owed money.

Displays:

- Running ISK total per manager, ranked — the primary league-facing view
- Per-gameweek winner history with the winning score
- Current gameweek's live leader while the gameweek is open
- **2025 hypothetical ledger** — what the rule *would* have paid had it existed, ties
  split. Clearly marked as hypothetical in the UI. Retained for two reasons: it is a fun
  retrospective, and it is the ledger's regression fixture, since the inputs and expected
  outputs are both known and fixed:

| Manager | GW wins | ISK |
|---|---|---|
| The Füllkrug Express | 8 | 12,000 |
| les Homms | 6 | 9,000 |
| Leibbi davíðs | 5 | 7,500 |
| Haaland, Sakalegur markaskorari | 5 | 6,750 |
| Year of the Diallo | 3 | 4,500 |
| Proof the Curse lives once more | 3 | 3,750 |
| FC Slaughterhouse! | 2 | 3,000 |
| Einn ís Kaldal | 2 | 3,000 |
| Palm Air | 1 | 1,500 |
| Earth, Wind & Maguire | 1 | 1,500 |
| **Total** | **36** | **52,500** |

  Every team won at least one gameweek. The single 2025 tie was GW16, where Proof the
  Curse and Haaland Sakalegur both scored 114.25 and split the prize 750/750 — which is
  why two managers show five and three wins but non-round ISK totals.

Money is displayed, so correctness here outranks every other feature. The ledger gets
the most thorough test coverage, including explicit tie cases.

### 2. Luck vs. skill

The headline metric exploits the league's own two-fixture format:

- **Real-opponent record** (35 games) — carries all schedule luck
- **League-average record** (35 games) — near-pure skill; beating the mean involves no
  opponent draw

The gap between them is the luck signal, native to how the league actually works.

Supporting metrics:

- **All-play record** — each gameweek, score every team against all others for
  finer-grained resolution than beat-the-mean
- **Expected points vs. actual** — from all-play win rate; surfaced as "+7 points on
  what you deserved"
- **Schedule swap** — replay each team's scores against every other team's real fixture
  list: "you would make playoffs under 11 of 13 schedules"
- **Points against** — hardest slate faced; count of losses to the gameweek's top score
- **Close-game record** — margin threshold derived from the league's own score
  distribution (a percentile), never a hardcoded constant
- **Alternate-universe tables** — the league table computed two ways, side by side: with
  only real matchups counting, and with only League Average games counting. The former is
  the luck-exposed table, the latter is near-pure merit. Presenting them adjacent is the
  sharpest available luck-vs-skill visual and costs nothing beyond arithmetic on data
  already loaded
- **Average threshold tracker** — the score required to beat the league mean in each
  gameweek, its trend across the season, and which managers clear it most reliably.
  Unique to this league's two-fixture format

### 3. Rivalries and head-to-head

Spans 2025 + 2026 for the eight returning managers.

- **Head-to-head matrix**, colour-scaled by aggregate margin, each cell expanding to
  individual meetings so a rivalry reads as a narrative
- **Nemesis and bunny** per manager — worst and best opponent by margin
- **Revenge fixtures** — upcoming opponents you lost to last meeting

In 2026, 35 gameweeks across 13 opponents means each pair meets two or three times, so
head-to-head records carry real signal rather than single-sample noise.

### 4. Records and superlatives

- Highest and lowest single-gameweek scores
- Win/loss streaks, current form
- **Form table** — a rolling six-gameweek mini-league, ranked on that window alone
- **Biggest collapse** — largest week-on-week score drop
- **Boom-or-bust** — each manager's full score distribution, charted. Backed by a
  variance figure, and paired deliberately with the luck metrics: high-variance teams
  accumulate flukey wins, metronomes get ground down
- **Power rankings** — blend of real record, all-play record and recent form, with
  weekly movement
- **Weekly awards**, auto-generated: Top Score, Biggest Blowout, **Unluckiest Loss**
  (highest score that still lost), **Luckiest Win** (lowest score that won). These work
  from gameweek one with no history requirement

## Architecture

### Stack

Next.js App Router on Vercel, TypeScript. No database, no cron, no secrets. Caching via
Next.js revalidation.

### Normalization boundary — the central structural decision

Raw Fantrax JSON is adapted into one internal `SeasonData` shape. Every stat function
depends **only** on `SeasonData`, never on Fantrax field names.

```
SeasonData {
  seasonYear, leagueId, teams[], periods[],
  matchups[]        // real fixtures, with scores
  averageFixtures[] // each team vs *League Average*, with scores
  rosters[]         // per period, active/reserve
  draftPicks[]
  players{}         // id -> name, club, position
  settings          // playoff config, regular-season length, scoring rules
}
```

`fxpa/req` is undocumented and will change shape. This boundary means such a change
touches exactly one adapter file while every stat keeps working.

### Modules

```
lib/fantrax/     one thin client per endpoint, returns validated typed objects
lib/adapt/       raw responses -> SeasonData
lib/stats/       pure functions, no I/O, one module per stat family
  ledger.ts      prize money
  luck.ts        real vs average record, all-play, expected points, schedule swap,
                 alternate-universe tables, average threshold tracker
  rivalry.ts     head-to-head matrix, nemesis, revenge
  records.ts     extremes, streaks, form table, boom-or-bust, biggest collapse,
                 power rankings, weekly awards
lib/season/      multi-season loading, manager identity mapping
app/             routes and UI
```

Each stats module is independently testable and holds one clear responsibility.

### Caching

| Data | Strategy |
|---|---|
| League settings, schedule, draft | Long — immutable once the season starts |
| Player name map | Long, filtered to the league's player pool |
| Standings, gameweek scores | ~30 minutes |
| Completed 2025 season | Effectively permanent |
| Past-period rosters | Immutable once the period closes |

### Validation and failure

Zod schemas at the normalization boundary. A response that stops matching fails loudly
with a readable error rather than rendering `NaN` into a league table or a wrong ISK
figure. Given the ledger represents real money, silent degradation is unacceptable.

### Manager identity across seasons

Fantrax issues a new `leagueId` and new `teamId`s per season, so managers are matched by
team name with a **manual override file** (`config/managers.ts`) mapping team names and
IDs to a stable manager identity. Team names drift between seasons; the override file is
the escape hatch. Unmatched teams are surfaced explicitly rather than silently dropped.

## Testing

Two complementary fixtures:

1. **The 2025 season as a real fixture.** A complete, genuine 35-gameweek season with
   known outcomes. The prize ledger, final standings and points totals documented above
   become regression assertions with verified expected values.
2. **A synthetic season generator.** Produces a plausible `SeasonData` — configurable
   team count, realistic score spreads, ties, blowouts, edge cases. Lets us exercise
   states 2025 never produced: multi-way ties for top score, a manager winning ten
   gameweeks, an all-play sweep.

Together these mean the full stats engine is testable before 2026 GW1 exists, and the
2026 page can be previewed at simulated GW12 to tune which stats are actually
interesting.

Priority: ledger tie-handling and gameweek-range boundaries (GW35 in, GW36 out) get
explicit cases. Money bugs are the only bugs the league will actually notice.

## Empty-state behaviour

2026 begins with zero data. Each stat declares a minimum gameweek count below which it
shows an honest "needs N more gameweeks" state rather than a misleading number —
expected wins over one gameweek is noise, not information.

The ledger and weekly awards are exempt: both are meaningful from GW1.

Because 2025 is fully in scope, the page is populated with real content on day one, and
the 2026 view fills in progressively.

## Risks

| Risk | Mitigation |
|---|---|
| `fxpa/req` changes shape | Normalization boundary + Zod; one file to fix, loud failure |
| Populated-2026 response shape differs from 2025 | Verifies itself at GW1 (2026-08-28); small adapter fix if so |
| Commissioner disables public view | Page breaks entirely. Documented as an operational dependency |
| Team renames mid-season break manager mapping | Override file keyed on stable `teamId` where possible |
| Ledger miscalculation | Heaviest test coverage; 2025 values as fixed regression assertions |

## Open questions

None blocking. Deferred items are listed under Out of Scope.
