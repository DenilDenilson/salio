import { readFile } from "node:fs/promises";
import { z } from "zod";
import { type AppConfig } from "../config";
import { AppError } from "../errors";
import {
  importStakeHtml,
  type OddsImporter,
} from "../importers/stake/importer";
import { type AppStore, type CreateMatchInput } from "../repositories/types";

export const CreateMatchSchema = z.object({
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().min(3),
  homeTeamName: z.string().min(1),
  awayTeamName: z.string().min(1),
  competitionName: z.string().optional(),
  kickoffAt: z.string().datetime(),
  timezone: z.string().min(1).default("America/Lima"),
  stakeUrl: z.string().url(),
});

export async function createMatch(input: {
  store: AppStore;
  config: AppConfig;
  form: unknown;
}) {
  const parsed = CreateMatchSchema.parse(input.form);
  return input.store.createMatch({
    ...parsed,
    competitionName: parsed.competitionName ?? null,
    oddsFreezeOffsetMinutes: input.config.ODDS_FREEZE_OFFSET_MINUTES,
  });
}

export async function importStakeForMatch(input: {
  store: AppStore;
  importer: OddsImporter;
  config: AppConfig;
  matchId: string;
  url: string;
  fixtureHtmlPath?: string;
}) {
  const match = await input.store.getMatchById(input.matchId);
  if (!match) {
    throw new AppError("MATCH_NOT_FOUND", "Match not found.", 404);
  }

  const capturedAt = new Date();
  const imported = input.fixtureHtmlPath
    ? importStakeHtml({
        html: await readFile(input.fixtureHtmlPath, "utf8"),
        url: input.url,
        capturedAt,
        matchId: match.id,
      })
    : await input.importer.importEvent({
        url: input.url,
        capturedAt,
        matchId: match.id,
      });
  return input.store.saveImportedSnapshot(match.id, imported);
}

export async function importStakeBySlug(input: {
  store: AppStore;
  importer: OddsImporter;
  config: AppConfig;
  slug: string;
  url: string;
  fixtureHtmlPath?: string;
}) {
  const fallback: CreateMatchInput = {
    slug: input.slug,
    title: "Partido importado",
    homeTeamName: "Local",
    awayTeamName: "Visitante",
    competitionName: null,
    kickoffAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    timezone: "America/Lima",
    stakeUrl: input.url,
    oddsFreezeOffsetMinutes: input.config.ODDS_FREEZE_OFFSET_MINUTES,
  };
  const tempMatch =
    (await input.store.getMatchBySlug(input.slug)) ??
    (await input.store.createMatch(fallback));
  const capturedAt = new Date();
  const imported = input.fixtureHtmlPath
    ? importStakeHtml({
        html: await readFile(input.fixtureHtmlPath, "utf8"),
        url: input.url,
        capturedAt,
        matchId: tempMatch.id,
      })
    : await input.importer.importEvent({
        url: input.url,
        capturedAt,
        matchId: tempMatch.id,
      });
  const match = await input.store.upsertMatchFromImport(
    input.slug,
    imported,
    fallback,
  );
  return input.store.saveImportedSnapshot(match.id, {
    ...imported,
    markets: imported.markets,
  });
}

export async function getFixtureCandidates(input: {
  store: AppStore;
  provider: unknown;
  matchId: string;
}) {
  const match = await input.store.getMatchById(input.matchId);
  if (!match) {
    throw new AppError("MATCH_NOT_FOUND", "Match not found.", 404);
  }
  return [];
}
