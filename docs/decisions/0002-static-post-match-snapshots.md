# Decision 0002: Static post-match snapshots with Astro Content Collections

Date: 2026-06-13

## Context

The product no longer needs a public live runtime, PostgreSQL, or Redis for the main visitor experience. Odds are captured locally before kickoff, then final match data is appended locally after the match and committed as immutable JSON.

## Decision

- Use Astro Content Collections as the public source of truth for matches.
- Store one versioned JSON snapshot per match in `src/content/matches`.
- Keep two phases: `odds_captured` for pre-match odds and `finalized` for post-match evaluated results.
- Render `/` and `/partidos/[slug]` from Content Collections with `prerender = true`.
- Build with Astro `output: "static"` and publish only the generated `dist/` directory.
- Remove the public server runtime: no admin routes, no `/api` routes, no serverless functions, no PostgreSQL, and no Redis are required for production hosting.
- Add local CLIs for the operational flow:
  - `pnpm odds:capture -- --slug=... --stake-url=...`
  - `pnpm stake:diagnose -- --stake-url=... --stake-api-url=...`
  - `pnpm espn:validate -- --slug=... --event-id=...`
  - `pnpm match:finalize -- --slug=... --event-id=...`
- Use demo fixtures/providers only when `DEMO_MODE=true` or the CLI passes `--demo-provider`. ESPN is the real post-match provider and does not require an API key.

## Technical deviations

- The public React board still reuses the `StateResponse` shape as a static build-time view model.
- Real Stake capture is API-only and must receive the complete internal Stake API URL explicitly.
- Demo finalization is intentionally explicit to avoid writing real match snapshots from demo sports data.

## Consequences

- Public pages can deploy as static content backed by reviewed JSON.
- Hosting does not need runtime writes, serverless functions, APIs, PostgreSQL, or Redis for match publishing.
- Pre-match odds can be committed before or after the match, but the snapshot records `odds.capturedAt` for audit.
