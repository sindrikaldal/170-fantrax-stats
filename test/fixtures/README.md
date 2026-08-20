# API fixtures

Real Fantrax API responses captured 2026-08-20, used as regression fixtures.
See `docs/superpowers/specs/2026-08-20-fantrax-league-stats-design.md`.

## 2025 — league `7he4pkgpme8uz58b` (complete season, 10 teams)

A finished 35-gameweek season with known outcomes. The primary correctness fixture.

- `getLeagueInfo.json` — schedule, scoring rules, teams
- `getStandings.json` — final table
- `fxpa-getStandings-schedule.json` — **all 35 gameweeks of matchup scores**, from one
  POST to `fxpa/req` with `getStandings` / `view: "SCHEDULE"`
- `fxpa-getTeamRosterInfo-p5.json` — per-player sample, Füllkrug Express through period 5.
  Note the figures are cumulative to date, not per-period.

Known-good values derived from these, asserted in tests:

- Prize ledger totals exactly 52,500 ISK over 35 gameweeks
- GW16 is a tie for top score (Proof the Curse and Haaland Sakalegur, both 114.25),
  splitting 750/750
- Highest scorer of the season (Füllkrug Express, 7211 FPts) finished 3rd
- GW1 League Average is 101.15, the exact mean of the ten team scores

## 2026 — league `ywhebyp7msyix1sj` (pre-season, 14 teams)

Captured the day before the season opened, so every score is zero. **This state is not
reproducible** — it is the empty-state fixture.

- `getLeagueInfo.json` — note `matchupList` holds 7 real matchups plus 14
  `*League Average*` rows whose `home` object is empty. Those rows are not malformed.
- `getStandings.json` — all teams 0-0-0
- `getDraftResults.json` — snake draft completed 2026-08-19
- `getTeamRosters-p1.json` — opening rosters with ACTIVE / RESERVE status
