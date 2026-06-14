# 0005 ESPN summary post-match provider

Date: 2026-06-14

## Status

Accepted. Supersedes
[`0004-api-football-post-match-finalization-guardrails.md`](0004-api-football-post-match-finalization-guardrails.md).

## Context

The project needs a low-friction post-match workflow. API-Football required
credentials and fixture search, which created operational ambiguity around
league/season filters and numeric fixture IDs.

ESPN exposes a public soccer summary JSON endpoint:

```text
https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=<EVENT_ID>
```

The operator can obtain the ESPN event ID from the match URL and pass it
directly to the local finalization command.

## Decision

- Replace API-Football as the real post-match provider with ESPN summary JSON.
- Store provider identity in `sportsData`, not `apiFootball`.
- Use string `eventId` values independent of provider-specific numeric types.
- Keep Stake capture unchanged.
- Keep the public site static through Astro Content Collections.
- Save raw ESPN evidence under `data/evidence/espn/` and store SHA-256 in the
  snapshot result evidence.
- Add `pnpm espn:validate -- --slug=... --event-id=...` for dry validation.
- Use `pnpm match:finalize -- --slug=... --event-id=...` for the write path.

## Guardrails

- The provider uses Zod to validate ESPN summary responses.
- HTTP requests have timeout, retry, headers and promise-cache behavior.
- Unknown ESPN statuses fail closed.
- AET/PEN are not finalized until score semantics are explicitly modeled.
- Fixture validation checks event ID, teams, home/away orientation, league slug,
  kickoff tolerance and score availability before writing.
- Frozen Stake odds are deep-compared before/after finalization after stripping
  only mutable settlement fields: `status`, `resolvedAt`, `resolvedMinute` and
  `resolutionReason`.
- `null` statistics remain unavailable data, not zero.

## Consequences

- No post-match API key is required.
- The operator must provide the ESPN event ID or keep it in `sportsData`.
- CI can fully mock ESPN via JSON fixtures.
- Historical API-Football references remain only in migration/decision history.
