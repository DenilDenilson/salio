import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FixtureStatus, type RuleEvaluationContext } from "../../domain/model";
import { importStakeHtml } from "../importers/stake/importer";
import { type AppStore } from "../repositories/types";
import { type AppConfig } from "../config";
import { readFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
export const stakeFixturePath = join(
  here,
  "../../../tests/fixtures/stake/event-canada-bosnia-finished.html",
);

export async function seedDemoData(
  store: AppStore,
  config: AppConfig,
): Promise<void> {
  const existing = await store.getMatchBySlug("canada-vs-bosnia");
  if (existing) {
    return;
  }
  const stakeUrl =
    "https://stake.pe/deportes/futbol/world-cup/event-canada-bosnia-demo";
  const match = await store.createMatch({
    slug: "canada-vs-bosnia",
    title: "Canadá vs Bosnia y Herzegovina",
    homeTeamName: "Canadá",
    awayTeamName: "Bosnia y Herzegovina",
    competitionName: "Copa Mundial 2026 · Grupo B",
    kickoffAt: "2026-06-12T19:00:00.000Z",
    timezone: "America/Lima",
    stakeUrl,
    oddsFreezeOffsetMinutes: config.ODDS_FREEZE_OFFSET_MINUTES,
  });
  const html = await readFile(stakeFixturePath, "utf8");
  const imported = importStakeHtml({
    html,
    url: stakeUrl,
    capturedAt: new Date("2026-06-12T18:57:00.000Z"),
    matchId: match.id,
  });
  await store.saveImportedSnapshot(match.id, imported);
  await store.freezeOdds(match.id, new Date("2026-06-12T18:57:00.000Z"), false);
  await store.confirmFixture(match.id, "demo-canada-bosnia", "demo");
  await store.saveLiveState({
    matchId: match.id,
    provider: "demo",
    fixtureStatus: FixtureStatus.FINISHED,
    elapsedMinutes: 90,
    scoreHome: 1,
    scoreAway: 1,
    context: initialContext(),
    capturedAt: new Date().toISOString(),
    fixtureLastRefreshAt: new Date().toISOString(),
    statsLastRefreshAt: new Date().toISOString(),
    playersLastRefreshAt: new Date().toISOString(),
    errors: [],
  });
  await store.publishMatch(match.id);
}

function initialContext(): RuleEvaluationContext {
  return {
    now: new Date(),
    fixtureStatus: FixtureStatus.FINISHED,
    elapsedMinutes: 90,
    score: { home: 1, away: 1, halftimeHome: 0, halftimeAway: 1 },
    firstScoringTeam: "AWAY",
    yellowCards: { home: 2, away: 1 },
    corners: { home: 8, away: 3 },
    playerStats: {},
  };
}
