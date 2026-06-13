import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("database migrations", () => {
  it("contains the required P0 persistence tables and indexes", () => {
    const sql = readFileSync(
      join(process.cwd(), "drizzle/0000_initial.sql"),
      "utf8",
    );
    for (const table of [
      "matches",
      "odds_snapshots",
      "markets",
      "selections",
      "live_snapshots",
      "match_events",
      "provider_mappings",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql).toContain("selections_match_id_idx");
    expect(sql).toContain("match_events_match_event_type_idx");
    expect(sql).toContain("live_snapshots_match_captured_idx");
  });
});
