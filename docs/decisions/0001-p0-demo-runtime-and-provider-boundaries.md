# Decision 0001: P0-first vertical slice and demo-safe runtime

Date: 2026-06-12

## Context

The repository started from the README specification only. The first delivery needed an end-to-end product path before expanding market coverage.

## Decision

- Implement P0 markets end to end first: match result, double chance, draw no bet, total goals, both teams to score, first team to score, total yellow cards, and total corners.
- Include limited P1 rules for exact score, team total goals, first-half total goals, anytime goalscorer, and player shots on target because they are low-risk extensions of the same deterministic engine.
- Keep the rule engine pure and provider-agnostic. API-Football JSON is adapted into internal provider models before evaluation.
- Make all tests and Playwright E2E run on local fixtures or demo providers only. CI must not call Stake or API-Football.
- Provide a `DEMO_MODE=true` runtime that seeds a published match from `tests/fixtures/stake/event-21798323-main-markets.html`.

## Technical deviations

- PostgreSQL migrations and Drizzle schema are included. Runtime currently uses the in-memory store for local demo and tests when no database URL is configured. The production Postgres repository should be wired as the next hardening step before deploying with real Supabase data.
- The Playwright importer includes the required browser/network-first shell and DOM fallback, but the reliable CI path uses the saved Stake HTML fixture. No CAPTCHA, login, private cookies, or protection bypass logic is implemented.
- The admin authentication is intentionally simple: signed HttpOnly cookie plus CSRF token. Password verification supports the demo password and an HMAC hash format for deployment.

## Consequences

- The MVP can be exercised end to end without external services.
- P0 market behavior is covered by deterministic unit and integration tests.
- Production persistence has a clear migration/schema contract, while the runtime remains safe to run in CI and local demo mode without credentials.
