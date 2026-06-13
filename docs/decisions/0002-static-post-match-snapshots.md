# Decision 0002: Static post-match snapshots with Astro Content Collections

Date: 2026-06-13

## Context

The product no longer needs a public live runtime, PostgreSQL, or Redis for the main visitor experience. Odds are captured locally before kickoff, then final match data is appended locally after the match and committed as immutable JSON.

## Decision

- Use Astro Content Collections as the public source of truth for matches.
- Store one versioned JSON snapshot per match in `src/content/matches`.
- Keep two phases: `odds_captured` for pre-match odds and `finalized` for post-match evaluated results.
- Render `/` and `/partidos/[slug]` from Content Collections with `prerender = true`.
- Add local CLIs for the operational flow:
  - `pnpm odds:capture -- --slug=... --stake-url=...`
  - `pnpm fixture:search -- --slug=...`
  - `pnpm match:finalize -- --slug=... --fixture-id=...`
- Use demo fixtures/providers only when `DEMO_MODE=true` or the CLI passes `--demo-provider`. Missing API-Football credentials must fail closed for `fixture:search` and `match:finalize`.

## Technical deviations

- Existing migrations, DB schema, admin endpoints, and live-state services remain in the repository as legacy compatibility. They are no longer the public rendering path.
- The public React board still reuses the old `StateResponse` shape, but snapshot pages pass `pollEnabled={false}` so they do not call `/api/matches/:slug/state`.
- Real Stake capture still depends on the existing Playwright importer. CI/demo paths should use saved HTML fixtures.
- Demo finalization is intentionally explicit to avoid writing real match snapshots from demo sports data.

## Consequences

- Public pages can deploy as static content backed by reviewed JSON.
- Vercel does not need runtime writes for match publishing.
- Pre-match odds can be committed before or after the match, but the snapshot records `odds.capturedAt` for audit.
