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
itself is gated behind a single shared password (`SITE_PASSWORD`, HTTP Basic,
enforced in `proxy.ts`) purely to deter casual discovery, since the ledger
names real people and real money. It authenticates *visitors to this site*,
never requests *to Fantrax*. See
`docs/superpowers/specs/2026-08-21-site-password-gate-design.md`.

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
sufficient. Do not remove them as redundant.

## Facts that cost real debugging time to learn

- Each team plays **two** fixtures per gameweek: one real opponent and one
  against `*League Average*` (the mean of all scores that week). The
  league-average fixtures are half of every team's record. Rows for them are
  identified by the **absence of a `teamId`** on the second team cell —
  structural, never name-based, so it survives team renames.
- Fantrax timestamps look like `2025-08-22T14:59:59.0-0400`: single-digit
  fractional second, colon-less offset. Outside ISO 8601; parses only because
  V8 is lenient. There is a test pinning this.
- The player-data sport code is `EPL`. `SOCCER` and `PL` both return
  `INVALID_SPORT`.
- Fantrax issues a **new `leagueId` per season**. `leagueHistoryId`
  (`6yst2cj3l5tiizya`) is stable across seasons — never use it as a season key.
- `getTeamRosterInfo` per-player figures are **cumulative to date**, not
  per-period. Weekly values need differencing consecutive periods.
- The prize rule is **new for 2026**. The 2025 ledger is hypothetical and every
  view of it must say so, unmissably.

## Environment

- Node 20.11+ (`vitest.config.mts` uses `import.meta.dirname`).
- Port 3000 on this machine is occupied by an unrelated nginx; `npm run dev`
  lands on 3001.
- `npm test` — 57 tests. No network calls in tests; they read committed
  fixtures from `test/fixtures/`, which are irreplaceable captured API
  responses. Never modify them.
