# 0004 API-Football post-match finalization guardrails

Status: Superseded by
[`0005-espn-summary-post-match-provider.md`](0005-espn-summary-post-match-provider.md).

## Decision

The post-match CLI flow for API-Football is guarded by a central competition
profile and by fixture identity validation before importing result data.

For Mundial 2026 snapshots, fixture search is restricted to API-Football
`league=1` and `season=2026`. The search command is diagnostic: it returns
accepted and rejected candidates, and it only recommends candidates above the
central auto-match threshold.

`match:finalize` now fetches the fixture by ID first, validates teams,
home/away orientation, league, season and kickoff tolerance, then verifies that
the provider status is finalizable (`FT`, `AET`, or `PEN`). Only after those
checks pass does it fetch events, team statistics and player statistics.

## Invariants

- Stake import/capture flows and frozen odds capture are outside this decision.
- Frozen odds identity, raw market data, selection IDs and decimal odds must not
  change during finalization.
- Provider `null` statistics remain unavailable data, not zero.
- Unsupported markets stay unsupported when data or rules are not reliable.
- Snapshots are written atomically through a temporary file and rename.

## Test harness notes

The CLI argument parser is covered directly, and the snapshot command flow is
covered through the same importer/provider/snapshot modules instead of spawning
`tsx` child processes from Vitest. In this sandboxed environment, nested child
process stdout was not reliable. The package scripts themselves remain the
operator-facing entrypoints.

Playwright E2E uses an isolated dev-server port so tests do not reuse a stale
local Astro server with a previous Vite overlay.

## Repair

`src/content/matches/catar-vs-suiza.json` was reset because it contained
fixture `1505459`, which represented different teams and competition data. The
repair preserved Stake metadata, market IDs, raw market names, selection IDs and
decimal odds, and removed the incorrect fixture ID, result, events, statistics,
player stats and generated settlement fields.
