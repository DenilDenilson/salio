# Decision 0006: Stake API-only odds capture

Date: 2026-06-15

## Context

The original pre-match capture opened the public Stake page with Playwright and
parsed rendered market DOM. That path proved fragile because the page can show
banners, cookie dialogs, lazy-loaded shells, or no market nodes in headless
mode.

The sportsbook widget also requests an internal JSON endpoint ending in
`/single-pre-event.json`. That payload contains structured event metadata and
flat odds entries with stable fields such as `event_id`, `union_id`,
`odd_code`, `odd_value`, player IDs, and player names.

## Decision

- Make `StakeImporter` API-only.
- Require the complete internal API URL through CLI `--stake-api-url` for every
  capture execution.
- Never hardcode, derive, construct, complete, discover, reuse, or correct
  `hidenseek` URLs.
- Use exactly the supplied API URL for `fetch` after validation.
- Validate internal API URLs with HTTPS, event ID matching, and an allowlist
  that supports suffixes such as `.websbkt.com` without allowing attacker
  lookalikes.
- Fetch API payloads with `curl` via `child_process.spawn`, timeout, limited
  retries, response size limit, JSON content-type checks, typed errors,
  browser-like headers, and redacted URLs.
- Keep a diagnostic command that compares native Node `fetch` and `curl` against
  the same provided URL without printing tokens.
- Validate the payload with Zod and group selections primarily by `union_id`.
- Classify markets primarily from `odd_code`, while preserving unknown markets as
  `UNSUPPORTED`.
- Remove automatic Playwright fallback and DOM scraping from the live capture
  flow.
- Preserve snapshot shape, frozen odds semantics, and post-match finalization.

## Technical deviations

- `ODD_FTB_2HALVES_*` is recognized but kept as `UNSUPPORTED`. The current
  domain model does not have a half-time/full-time market type or settlement
  rule, so forcing it into another type would be misleading.
- API payload evidence is available on the internal importer result and through
  `--save-raw-api`, but the public match snapshot remains unchanged to preserve
  the existing content contract.
- HTML fixtures and `importStakeHtml` remain only as legacy test/demo helpers;
  they are not used by `pnpm odds:capture`.
- The initial Node `fetch` transport returned HTTP 406 against Stake in local
  testing, while the working curl request depended on a narrower Brave/Chromium
  header set. The production transport therefore uses curl with separated
  arguments and `shell: false`.

## Consequences

- Normal capture depends less on rendered HTML and more on structured market
  data.
- CI remains offline: unit tests use local Stake API fixtures and mocked fetches.
- Operators must obtain a fresh internal API URL when Stake changes hostnames or
  query tokens.
- Secrets in `hidenseek` are not persisted in logs or sanitized evidence.
