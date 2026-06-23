# Decision 0003: Stake live capture browser modes

Date: 2026-06-13

Status: Retired for live capture. The current capture path is API-only and is
defined in [Decision 0006](0006-stake-api-first-odds-capture.md).

## Context

Stake serves sportsbook markets through an embedded `websbkt.com` widget. The raw Stake page can contain the wrapper script and app shell without the rendered market DOM. In that state there are no `.wol-market` or market data attributes to parse, even though a normal browser may show odds after the widget finishes mounting.

## Decision

- Keep frozen HTML fixtures for tests and CI. CI must not call Stake.
- Keep live capture as a local operator action from the public Stake URL.
- Default live capture uses Playwright headless for automation.
- Add `--headed` for local visible Chromium when the widget does not expose markets in headless mode.
- Support Chrome/Chromium CDP endpoints through `BROWSER_WS_ENDPOINT`, for example `http://127.0.0.1:9222`, so local capture can reuse an already-open browser context with accepted cookies or a logged-in session when needed.

## Consequences

- The scalable source remains the Stake URL, not pasted HTML.
- The DOM parser only runs after the sportsbook widget has rendered actual market nodes.
- If Stake blocks or changes the embedded widget behavior, the failure mode is explicit: no market nodes were available in the captured page.
