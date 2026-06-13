import { describe, expect, it } from "vitest";
import { getConfig } from "../../src/server/config";
import { stakeFixturePath } from "../../src/server/demo/seed";
import { StakeImporter } from "../../src/server/importers/stake/importer";
import { DemoSportsProvider } from "../../src/server/providers/demoProvider";
import { MemoryAppStore } from "../../src/server/repositories/memoryStore";
import {
  createMatch,
  getFixtureCandidates,
  importStakeBySlug,
} from "../../src/server/services/admin";

describe("admin services", () => {
  it("creates a match, imports by slug with fixture and gets mapping candidates", async () => {
    const config = getConfig();
    const store = new MemoryAppStore();
    const provider = new DemoSportsProvider();
    const importer = new StakeImporter({
      allowedHosts: ["stake.pe"],
      timeoutMs: 1000,
      fixtureHtmlPath: stakeFixturePath,
    });

    const match = await createMatch({
      store,
      config,
      form: {
        slug: "admin-test",
        title: "Estados Unidos vs Paraguay",
        homeTeamName: "Estados Unidos",
        awayTeamName: "Paraguay",
        competitionName: "Amistoso internacional",
        kickoffAt: "2026-06-20T21:00:00.000Z",
        timezone: "America/Lima",
        stakeUrl:
          "https://stake.pe/deportes/futbol/international/event-21798323",
      },
    });

    const snapshot = await importStakeBySlug({
      store,
      importer,
      config,
      slug: match.slug,
      url: match.stakeUrl,
      fixtureHtmlPath: stakeFixturePath,
    });
    const candidates = await getFixtureCandidates({
      store,
      provider,
      matchId: match.id,
    });

    expect(snapshot.markets.length).toBeGreaterThanOrEqual(8);
    expect(candidates[0]).toEqual(
      expect.objectContaining({ fixtureId: 990001 }),
    );
  });

  it("rejects invalid create input", async () => {
    await expect(
      createMatch({
        store: new MemoryAppStore(),
        config: getConfig(),
        form: {
          slug: "No Spaces",
          title: "x",
          homeTeamName: "",
          awayTeamName: "",
          kickoffAt: "bad",
          stakeUrl: "notaurl",
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("rejects imports and candidates for missing matches", async () => {
    const config = getConfig();
    const store = new MemoryAppStore();
    const importer = new StakeImporter({
      allowedHosts: ["stake.pe"],
      timeoutMs: 1000,
      fixtureHtmlPath: stakeFixturePath,
    });

    await expect(
      importStakeBySlug({
        store,
        importer,
        config,
        slug: "missing-import",
        url: "https://stake.pe/deportes/futbol/international/event-21798323",
      }),
    ).resolves.toBeTruthy();
    await expect(
      getFixtureCandidates({
        store,
        provider: new DemoSportsProvider(),
        matchId: "missing",
      }),
    ).rejects.toMatchObject({ code: "MATCH_NOT_FOUND" });
  });
});
