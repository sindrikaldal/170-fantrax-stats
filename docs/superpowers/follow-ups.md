# Follow-ups

Carried forward from the foundation + prize-ledger branch. Each was reviewed,
judged non-blocking, and deliberately deferred — not forgotten.

## Money path (highest priority)

**Completeness guard cannot detect truncated fixture rows.**
`lib/stats/ledger.ts` withholds a gameweek unless every team has reported a
score, deriving the expected count as `2 x (fixtures in that period)`. That
count comes from the same `season.fixtures` array `scoresForPeriod` reads, so
if `adaptSchedule` ever dropped rows for a period while the surviving rows had
complete scores, the ledger would pay out among the survivors rather than
withholding — potentially crowning the wrong winner.

The earlier version compared against `season.teams.length`, which caught this
but coupled two fetches with different cache windows (league info 24h, schedule
30min), so a mid-season team-count change blanked the whole ledger for up to a
day behind "No gameweeks have finished yet". That was the worse live failure,
so the trade was correct — but the blind spot is real.

Suggested fix: compare a period's fixture count against the maximum
fixtures-per-period observed across the same schedule response. That is
self-consistent within one fetch, so it is immune to cache skew, while still
catching a period whose rows were truncated.

Unconfirmed: requires a parse failure not observed against either season.

## Robustness

- **`parsePeriod` has no diagnostic.** A caption that does not match
  `^Gameweek N$` is skipped silently. Now safe (it can no longer collide into a
  live period) but a future caption change would drop data with no signal.
- **Mid-season team dropout.** If a manager leaves, that gameweek's fixture
  count changes; the guard withholds rather than mispays, but the behaviour
  around the transition week has never been exercised.
- **No 2026 schedule fixture.** `adaptSchedule` is only tested against
  10-team 2025 data. The live 2026 response was verified structurally by hand,
  but there is no regression test. Capturing the current all-zero 2026 schedule
  would also give a real-data test for the `topScore <= 0` guard.

## Test quality

- **Discriminator tests cannot distinguish structural from name-based.** The
  `*League Average*` check keys on a missing `teamId` specifically so it
  survives team renames, but every test uses real data where the name and the
  missing `teamId` coincide — a name-based implementation would pass the same
  suite. Needs a synthetic adversarial row.
- **Two vacuous tests.** The playoff-exclusion assertions in
  `lib/stats/ledger.test.ts` and `lib/domain/season.test.ts` cannot fail:
  `completedRegularPeriods` structurally cannot emit a period above 35.
- **`teamMeta` merge test** asserts `logoUrl` is non-null but not `shortName`,
  so a regression dropping `shortName` would pass.
- **Misfiled tests.** `lib/domain/smoke.test.ts` tests fixtures, not domain, and
  duplicates an assertion in `lib/fantrax/schemas.test.ts`.
  `lib/domain/types.test.ts` tests `config/leagues.ts`.

## Deferred from the phase 4 UI verification pass (2026-08-21)

**Capture a 2026 fixture the moment gameweek 1 settles.** Still the highest-value
missing test, and it expires: `adaptSchedule` is verified only against completed
10-team 2025 data, and a *partially* settled gameweek — the exact state the money
guards exist for — can only be captured while it is happening. Capture the
schedule response mid-gameweek-1 and again once it settles.

**Two render paths have never been seen with real data.** Both are gated behind a
season state that has not occurred yet, and neither can be exercised without
faking data into the page, which the plan forbids:

- *Awards strip at four across.* `AwardsStrip` has only ever rendered its empty
  state, because 2026 has no settled gameweek. The `lg:grid-cols-4` layout, the
  award copy against real numbers, and the all-drawn-gameweek fallback are all
  unverified in a browser.
- *A populated ledger with a withheld gameweek.* The empty-ledger withheld
  warning was verified with a synthetic date (2026 at `2026-09-30` yields four
  withheld periods, warning renders at 6.84:1). The other branch — the caption
  warning inside a ledger that already has counted gameweeks — needs
  `settled > 0 && withheld > 0`, which neither real season can produce: 2025 is
  fully settled and 2026 has no real scores at all. The computation behind it is
  covered by eight unit tests; only the rendering is unexercised.

**The season-page ledger runs full width alone.** At 1200px the ledger table
stretches, leaving a wide gap between team name and the right-aligned figures.
It passes the "no lone narrow column" check and reads fine, and every
alternative tried was worse — capping the table leaves dead space inside its
card, and centring it fights the left-aligned section header. Pairing it with
the gameweek-history fold is the promising option, but that fold is collapsed
by default and 35 rows tall when open. Left deliberately; revisit if it grates.

**Crest fallbacks depend on client JS.** `CrestImage` swaps a dead Fantrax logo
URL for a monogram only after hydration, so with JS disabled the broken-image
glyph returns. Acceptable for a page that is already client-interactive (the
h2h matrix), but a `next/image` migration or a server-side URL health check
would fix it properly.

**`AGENTS.md` says 57 tests; the suite is at 141.** Left alone deliberately
mid-branch — it moved three times during phase 4 — but it should be corrected
when this branch merges.

## Housekeeping

- `AGENTS.md` / `CLAUDE.md` are auto-generated by `next dev` and contain only a
  Next.js notice. Worth replacing with the project's real invariants — the
  no-auth rule and the normalization boundary are the two things a future
  session is most likely to break.
- Dead-for-now exports kept as deliberate foundations for later plans:
  `fetchStandings`, `StandingsSchema`, `LEAGUE_HISTORY_ID`, `CURRENT_SEASON`,
  `ManagerId`, and `averageFixtures` (adapted and tested, not yet consumed).
- `next.config.ts` is an empty stub.
- Port 3000 on this machine is occupied by an unrelated nginx, so `npm run dev`
  lands on 3001.

## Deferred from the runner-up and bench work (2026-09-06)

- **The page scrolls horizontally on phones.** With a 375px viewport the
  document's scroll width is about 1340px, and the widest box is the
  head-to-head matrix table, which already sits inside an `overflow-x-auto`
  wrapper. Predates this work; not investigated further. Likely the wrapper's
  grid parent lacks `min-w-0`, so the wrapper itself is as wide as the table.
- **`tableType` flips at kickoff** (verified 2026-09-06), so an open-window
  gameweek is in progress. Money surfaces now count final gameweeks only.
  The non-money stats (luck, records, form, power, league table) still read
  `settled`, which includes the in-progress week, so e.g. a "lowest score"
  record can briefly name a team that has a match still to play. Decide
  whether they should switch to final-only too; it is a one-line change in
  `app/lib/season-view.ts` but brings back a multi-day lag for those blocks.
- **Late corrections after the window closes are not caught.** Lineups are
  re-captured daily only while the window is open; a stat correction Fantrax
  posts after that is missed. Same exposure as the ledger has always had.
- **No test exercises a multi-position player.** `bestLineup` handles them by
  trying every assignment, covered by a synthetic test, but none of the 5,487
  committed player rows across both seasons has more than one position, so
  the branch has never run on real data.
- **The snapshot Action has never run in GitHub.** It was exercised locally
  only (`npm run snapshot`, idempotent on re-run). First real run is the
  morning after the workflow is pushed; check the Actions tab once.

## Deferred from the manager pages (2026-09-06)

- **Manager URLs are derived from team names.** `/manager/<id>` uses the
  manager id from `resolveManagers`, which is a slug of the team name unless
  `config/managers.ts` overrides it. A rename without an override therefore
  changes the URL and orphans any shared link. The override file is the fix;
  a redirect from old slugs would need a history of them.
- **No test covers the manager page composition.** `managerSeasonStats` is
  a pure selection over reports that are each tested; the page itself is
  verified only in the browser for both seasons and a 404.
