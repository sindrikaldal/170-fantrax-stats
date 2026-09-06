<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 170 Broskis — project invariants

Stats page for a Fantrax fantasy Premier League draft league. Read
`docs/superpowers/specs/` for the design and `docs/superpowers/follow-ups.md`
for known deferred issues.

## These four break the app if violated

**1. No Fantrax credentials, ever.** The Fantrax league is public-readable, so
there are deliberately no Fantrax cookies, API keys, or tokens anywhere in
this app. A private league plus a stored session cookie was considered and
rejected: it introduces a rotating secret and a silent-staleness failure mode.
If you find yourself adding a Fantrax credential, the approach is wrong.

Operational dependency: this rests on "Allow public to view league" being
enabled in Fantrax. If it is ever switched off, the app stops working.

The one bounded exception, and it is unrelated to fetching data: the site
itself is gated behind a single shared password (`SITE_PASSWORD`) purely to
deter casual discovery, since the ledger names real people and real money. It
authenticates *visitors to this site*, never requests *to Fantrax*. `proxy.ts`
redirects anyone without a valid cookie to `/login`; the cookie is an HMAC
keyed by the password itself, so there is no second secret and changing the
password logs everybody out. See
`docs/superpowers/specs/2026-08-21-login-page-gate-design.md`.

**2. The normalization boundary.** Raw Fantrax JSON is validated in
`lib/fantrax/` and adapted in `lib/adapt/` into one internal `SeasonData`
shape. Nothing outside those two directories may reference a Fantrax field
name, response shape, or magic string. `fxpa/req` is an undocumented internal
endpoint that will change; this boundary is why that costs one file instead of
a rewrite.

**3. Purity in stats.** Every function in `lib/stats/` takes `now` as a
parameter and never reads wall-clock time. Tests depend on it.

**4. The ledger is real money.** `lib/stats/ledger.ts` computes prize money
owed to real people. Its correctness outranks every other feature. The 2025
regression values are fixed and must never be "adjusted to match output":
exactly 35 gameweeks, exactly 52,500 ISK, Füllkrug Express 8 wins / 12,000 ISK,
gameweek 16 a tie splitting 750/750.

Two guards exist because Fantrax reports an unplayed gameweek's score as the
string `"0"`, not blank, so a date-based completeness check alone is not
sufficient. Do not remove them as redundant. They matter more now that
published results, not the period window, decide when a gameweek is judged:
the guards are what stop a placeholder all-zero week from paying out.

## Facts that cost real debugging time to learn

- Each team plays **two** fixtures per gameweek: one real opponent and one
  against `*League Average*` (the mean of all scores that week). The
  league-average fixtures are half of every team's record. Rows for them are
  identified by the **absence of a `teamId`** on the second team cell —
  structural, never name-based, so it survives team renames.
- Because of those two fixtures, a team's weekly score appears **twice** in the
  schedule response, and Fantrax's own `totalPointsFor` in `getStandings` adds
  both: 6944 for a 2025 team that actually scored 3472. That doubling is an
  artefact, not extra points. `combinedRecords` counts each gameweek once, so
  its `pointsFor` is deliberately half Fantrax's figure. Ranking is unaffected —
  halving every row is monotonic.
- A gameweek's **period window closes days after its matches finish**. GW1 2026
  ran Fri Aug 21 to Fri Aug 28 while its matches ended Mon Aug 24. Treating
  "window closed" as "gameweek finished" hid every finished gameweek for
  three to four days. `auditRegularPeriods` therefore keys off published
  results, with the window kept only as a fallback.
- The per-gameweek "has been scored" signal is the schedule table's
  **`tableType`**: `H2hPointsBased3` once results exist, `H2hPointsBased2`
  while the table still holds placeholder zeros. Verified across all 70
  tables of both seasons. It is the only such signal in that response —
  `displayedEndDate` is a season-level `min(now, seasonEnd)` cursor, and
  `getLiveScoringInfo`/`getMatchupPreview`/`getFantasyMatchup` do not exist.
  It flips **at kickoff, not at finalisation** (verified live 2026-09-06: GW3
  flagged with one match still to play). So "published results + open
  window" means *in progress*, not "awaiting corrections". The ledger,
  runner-up and bench modules pay and count **final gameweeks only**
  (window closed); an in-progress gameweek is shown as a live leader with
  its ISK pending. Other stats still read `settled`, which includes the
  in-progress week.
- `periodsWithResults` describes **the fetch, not a point in time**. A fixture
  captured after a season ended claims every gameweek has results, so any
  test replaying an earlier date must also replay what was published by then
  (`withPublishedResults` in `test/helpers/synthetic.ts`). It is additionally
  gated on the period having started, so a finished season cannot report
  gameweeks as played before the season began.
- Fantrax timestamps look like `2025-08-22T14:59:59.0-0400`: single-digit
  fractional second, colon-less offset. Outside ISO 8601; parses only because
  V8 is lenient. There is a test pinning this.
- The player-data sport code is `EPL`. `SOCCER` and `PL` both return
  `INVALID_SPORT`.
- Fantrax issues a **new `leagueId` per season**. `leagueHistoryId`
  (`6yst2cj3l5tiizya`) is stable across seasons — never use it as a season key.
- `getTeamRosterInfo` per-player figures are **cumulative to date** in its
  default timeframe. Pass `timeframeTypeCode: 'BY_PERIOD'` for one gameweek's
  figures, bench included; verified for both seasons, and the starters sum
  exactly to the team's recorded score. The team is selected by **`teamId`**;
  `fantasyTeamId` is silently ignored and returns the commissioner's team,
  which is how every "per-team" capture came back identical once.
- Lineups are **never fetched at request time**. `scripts/snapshot-lineups.ts`
  (daily GitHub Action) commits them to `data/lineups/<year>/gwNN.json`, and
  refuses to write a gameweek unless every team's starters sum to the score
  in the schedule. `lib/stats/bench.ts` drops any committed gameweek that
  fails the same check, so a bad file can never show a regret figure.
- The prize rule is **new for 2026**. The 2025 ledger is hypothetical and every
  view of it must say so, unmissably.

## Environment

- Node 20.11+ (`vitest.config.mts` uses `import.meta.dirname`).
- Port 3000 on this machine is occupied by an unrelated nginx; `npm run dev`
  lands on 3001.
- `npm test` — 57 tests. No network calls in tests; they read committed
  fixtures from `test/fixtures/`, which are irreplaceable captured API
  responses. Never modify them.
