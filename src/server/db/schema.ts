import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    homeTeamName: text("home_team_name").notNull(),
    awayTeamName: text("away_team_name").notNull(),
    competitionName: text("competition_name"),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    status: text("status").notNull(),
    stakeUrl: text("stake_url").notNull(),
    stakeEventId: text("stake_event_id"),
    sportsEventId: text("sports_event_id"),
    sportsProvider: text("sports_provider"),
    oddsFreezeOffsetMinutes: integer("odds_freeze_offset_minutes")
      .notNull()
      .default(3),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("matches_slug_idx").on(table.slug),
    sportsEventIdx: uniqueIndex("matches_sports_event_id_idx").on(
      table.sportsEventId,
    ),
  }),
);

export const oddsSnapshots = pgTable("odds_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id),
  status: text("status").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  source: text("source").notNull(),
  sourcePayload: jsonb("source_payload"),
  importVersion: text("import_version").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const markets = pgTable("markets", {
  id: uuid("id").primaryKey().defaultRandom(),
  snapshotId: uuid("snapshot_id")
    .notNull()
    .references(() => oddsSnapshots.id),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id),
  marketType: text("market_type").notNull(),
  rawMarketName: text("raw_market_name").notNull(),
  sourceMarketId: text("source_market_id"),
  displayOrder: integer("display_order").notNull(),
  supported: boolean("supported").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
});

export const selections = pgTable("selections", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketId: uuid("market_id")
    .notNull()
    .references(() => markets.id),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id),
  operator: text("operator").notNull(),
  participantType: text("participant_type").notNull(),
  participantId: text("participant_id"),
  participantName: text("participant_name"),
  line: numeric("line"),
  exactHomeScore: integer("exact_home_score"),
  exactAwayScore: integer("exact_away_score"),
  oddDecimal: numeric("odd_decimal").notNull(),
  rawSelectionName: text("raw_selection_name").notNull(),
  sourceSelectionId: text("source_selection_id"),
  status: text("status").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedMinute: integer("resolved_minute"),
  resolutionReason: text("resolution_reason"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const liveSnapshots = pgTable("live_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id),
  provider: text("provider").notNull(),
  fixtureStatus: text("fixture_status").notNull(),
  elapsedMinutes: integer("elapsed_minutes"),
  scoreHome: integer("score_home").notNull(),
  scoreAway: integer("score_away").notNull(),
  payload: jsonb("payload").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
});

export const matchEvents = pgTable(
  "match_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    teamSide: text("team_side"),
    playerProviderId: text("player_provider_id"),
    playerName: text("player_name"),
    minute: integer("minute"),
    extraMinute: integer("extra_minute"),
    isCancelled: boolean("is_cancelled").notNull().default(false),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
  },
  (table) => ({
    uniqueProviderEvent: uniqueIndex(
      "match_events_match_provider_event_idx",
    ).on(table.matchId, table.providerEventId),
  }),
);

export const providerMappings = pgTable("provider_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id),
  provider: text("provider").notNull(),
  providerFixtureId: text("provider_fixture_id").notNull(),
  homeTeamProviderId: text("home_team_provider_id"),
  awayTeamProviderId: text("away_team_provider_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
  confirmedBy: text("confirmed_by").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
});
