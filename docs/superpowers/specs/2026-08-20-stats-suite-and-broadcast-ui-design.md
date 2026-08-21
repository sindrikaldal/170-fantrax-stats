# Stats Suite and Page Redesign

**Date:** 2026-08-20
**Status:** Approved, ready for planning
**Builds on:** `2026-08-20-fantrax-league-stats-design.md` (foundation + prize ledger, shipped)

**Amended 2026-08-21** (phase 4 only; phases 0-3 untouched). The original
direction was a dark sports-broadcast treatment. On review it was rejected: too
dark, too dense on desktop, and the broadcast styling was not wanted. The
information design it specified — crests, large numerals, award cards, form
arrows, score-bat framing — survives; the TV-graphics skin does not. Sections
below carry the amended text. The filename keeps its original slug because git
history and the companion plan reference it.

## What shipped already

The foundation is merged on `main`: the Fantrax data layer, the `SeasonData`
normalization boundary, and the gameweek prize ledger, rendering for both the
2025 and 2026 seasons. 57 tests. See the prior spec for verified API facts.

The page currently works and is deliberately plain. That is the problem this
spec addresses, alongside the four stat families the prior spec scoped but did
not implement.

## Scope

One plan, four stat families plus a UI phase. The families are independent —
each is a pure module over `SeasonData` with no shared state and no ordering
between them — which is why they combine into a single plan cleanly. The
foundation's tasks had to be sequential; these do not.

### Phase 0 — Ledger hardening (do first)

From `docs/superpowers/follow-ups.md`, the money-path item. The completeness
guard derives its expected score count from the same `season.fixtures` array
that `scoresForPeriod` reads, so a period whose rows were truncated during
parsing would pay out among the survivors rather than withholding.

Fix: compare a period's fixture count against the maximum fixtures-per-period
observed across the same schedule response. Self-consistent within one fetch,
so immune to cache skew, while still catching truncation.

Small, and it is the ledger. It goes first.

### Phase 1 — Luck vs. skill

The headline analytical feature, built on the league's own two-fixture format.

- **Real-opponent record vs. League-Average record.** 35 games each. The
  league-average record is near-pure skill; the real-opponent record carries
  all schedule luck. The gap between them is the luck signal, and it is native
  to how this league actually works.
- **Alternate-universe tables.** The league table computed two ways, side by
  side: real matchups only, and league-average games only. The sharpest luck
  visual available, and pure arithmetic on data already loaded.
- **All-play record.** Each gameweek, score every team against all others, for
  finer resolution than beat-the-mean.
- **Expected points vs. actual.** From all-play win rate. Surfaced as "+7 on
  what you deserved".
- **Schedule swap.** Replay each team's scores against every other team's real
  fixture list: "you would make playoffs under 11 of 13 schedules".
- **Points against.** Hardest slate faced; count of losses to the gameweek's
  top score.
- **Close-game record.** Margin threshold derived from the league's own score
  distribution as a percentile, never a hardcoded constant.
- **Average threshold tracker.** The score needed to beat the mean each
  gameweek, its trend, and who clears it most reliably.

### Phase 2 — Rivalries

Spans 2025 and 2026 for the eight returning managers. Requires
`config/managers.ts`, deferred from the foundation plan because the ledger is
per-season and needed no cross-season identity. This is its first real consumer.

Managers are matched by team name with a manual override file keyed on team IDs
where possible. Names drift between seasons; the override file is the escape
hatch. Unmatched teams must be surfaced explicitly, never silently dropped.

- **Head-to-head matrix**, colour-scaled by aggregate margin, each cell
  expanding to the individual meetings so a rivalry reads as a story.
- **Nemesis and bunny** per manager — worst and best opponent by margin.
- **Revenge fixtures** — upcoming opponents you lost to last meeting.

In 2026, 35 gameweeks across 13 opponents means each pair meets two or three
times, so these records carry real signal rather than single-sample noise.

### Phase 3 — Records and superlatives

- Highest and lowest single-gameweek scores
- Win/loss streaks and current form
- **Form table** — rolling six-gameweek mini-league
- **Boom-or-bust** — each manager's score distribution, charted, backed by a
  variance figure. Pairs deliberately with the luck metrics: high-variance
  teams collect flukey wins, metronomes get ground down.
- **Biggest collapse** — largest week-on-week score drop
- **Power rankings** — blend of real record, all-play record and recent form,
  with weekly movement
- **Weekly awards**, auto-generated: Top Score, Biggest Blowout, Unluckiest
  Loss (highest score that still lost), Luckiest Win (lowest score that won).
  These work from gameweek one with no history requirement.

### Phase 4 — Page redesign

**This phase works differently from every other phase and from the foundation
plan.** The stat tasks carry verbatim code and known-correct expected values —
transcription plus verification. Design cannot be specified that way, and it
must not be attempted before the stats exist, because you cannot lay out data
you have not seen.

So: build phases 0-3 first, look at the real numbers, then design against them
with visual iteration in a browser. Load the `frontend-design` skill for this
phase.

**Direction: editorial data magazine.** Light, open, confident with numbers.
Team crests (Fantrax supplies logo URLs in `fantasyTeamInfo`), large tabular
numerals, award cards, form arrows and score-bat framing for head-to-head
figures — the information design that makes twenty stats readable at a glance.
What it is *not*: a TV graphics package. No dark stadium palette, no heavy
condensed capitals as the default voice, and no animated number count-ups
(dropping those also removes a client component and its reduced-motion
handling). Hierarchy comes from scale, weight and whitespace; character comes
from one display face used sparingly — masthead, section heads, headline stat
numerals — over Geist everywhere else.

The page should feel like a well-set stats page in a good sports magazine. The
fun lives in the copy, the crests and the numbers, not in the chrome.

**Voice: English, full trash talk.** Lean into it — "Unluckiest Loss",
"Bottled it", "Left 40 on the bench". This page exists to be dropped in a group
chat. The stats are the ammunition; the copy is the delivery.

**Non-negotiable constraints on the design.** These are not stylistic
preferences, they are correctness requirements learned the hard way:

1. **Prize figures must be legible and the hypothetical disclaimer
   unmissable.** The foundation shipped a bug where light-mode contrast left
   the 2025 ledger crisp and its "this is not real money" warning effectively
   invisible. Any design must be verified in *both* light and dark rendering,
   or must commit to one unconditionally and paint its own background. Playful
   never outranks a person misreading what they are owed.

   **This design commits to light, unconditionally.** `color-scheme: light`,
   the body paints its own background token, and no rule anywhere branches on
   `prefers-color-scheme`. One palette, one set of contrast checks, and the
   invisible-disclaimer failure mode cannot recur. The accepted cost: a reader
   on a dark-mode phone opening the link from the group chat gets a bright
   page.

   The accents must be re-derived, not translated. The colours a dark
   treatment would use (a bright gold, a bright sky blue) fail WCAG AA against
   a light background; reusing them is the same bug in the other direction.
   Every accent, every diverging colour scale, and all disclaimer text must be
   checked against the painted light background.
2. **Empty and partial states are first-class.** The 2026 season fills in over
   nine months. Most stats need 6-10 gameweeks before they say anything true.
   Each must show an honest "needs N more gameweeks" state rather than a
   confident wrong number. A design that only looks good full of data is not
   finished.
3. **Twenty stats must not arrive as twenty tables.** A clear front page —
   ledger, table, this week's awards — with the deeper analysis a click away.
   This is the difference between a page the league opens weekly and one they
   admire once.
4. **Phone first, but desktop is a layout of its own.** It will be opened
   from a group chat, so 375 px is the primary target. Desktop is not that
   layout stretched wide: content that is naturally parallel must sit
   side by side, and the container must use meaningfully more than the ~768 px
   the foundation shipped. Prose line length stays capped for readability even
   when the container is wide.

## Architecture

Unchanged from the foundation. Each stat family is a pure module in
`lib/stats/` depending only on `SeasonData`, one module per family, no I/O. The
normalization boundary holds: nothing outside `lib/fantrax/` and `lib/adapt/`
references a Fantrax field name.

New: `config/managers.ts` for cross-season manager identity.

No new data sources. Every stat here computes from team-level gameweek scores
plus the schedule, already loaded in two requests per season. Nothing needs
per-player data, storage, or authentication.

## Testing

The 2025 season remains the primary correctness fixture — a complete
35-gameweek season with known outcomes. The synthetic-season generator from the
foundation plan is the tool for states 2025 never produced.

**Capture a 2026 fixture as soon as gameweek 1 settles.** The foundation is
verified only against completed 10-team 2025 data. The live 14-team response
was verified structurally by hand but has no regression test, and a
partially-settled gameweek — precisely the state the money guards exist for —
can only be captured while it is happening.

## Out of scope

Unchanged from the foundation spec: benched-points regret, draft analysis,
pre-gameweek predictions, seasons before 2025. Each is documented there with
its reasoning and cost.
