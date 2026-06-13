CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  home_team_name text NOT NULL,
  away_team_name text NOT NULL,
  competition_name text,
  kickoff_at timestamptz NOT NULL,
  timezone text NOT NULL,
  status text NOT NULL,
  stake_url text NOT NULL,
  stake_event_id text,
  api_football_fixture_id bigint UNIQUE,
  odds_freeze_offset_minutes integer NOT NULL DEFAULT 3,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  status text NOT NULL,
  captured_at timestamptz NOT NULL,
  frozen_at timestamptz,
  source text NOT NULL,
  source_payload jsonb,
  import_version text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES odds_snapshots(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  market_type text NOT NULL,
  raw_market_name text NOT NULL,
  source_market_id text,
  display_order integer NOT NULL,
  supported boolean NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  operator text NOT NULL,
  participant_type text NOT NULL,
  participant_id text,
  participant_name text,
  line numeric,
  exact_home_score integer,
  exact_away_score integer,
  odd_decimal numeric NOT NULL,
  raw_selection_name text NOT NULL,
  source_selection_id text,
  status text NOT NULL,
  resolved_at timestamptz,
  resolved_minute integer,
  resolution_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  provider text NOT NULL,
  fixture_status text NOT NULL,
  elapsed_minutes integer,
  score_home integer NOT NULL,
  score_away integer NOT NULL,
  payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  team_side text,
  player_provider_id text,
  player_name text,
  minute integer,
  extra_minute integer,
  is_cancelled boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  occurred_at timestamptz,
  UNIQUE(match_id, provider_event_id)
);

CREATE TABLE IF NOT EXISTS provider_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_fixture_id text NOT NULL,
  home_team_provider_id text,
  away_team_provider_id text,
  confirmed_at timestamptz NOT NULL,
  confirmed_by text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS selections_match_id_idx ON selections(match_id);
CREATE INDEX IF NOT EXISTS selections_status_idx ON selections(status);
CREATE INDEX IF NOT EXISTS match_events_match_event_type_idx ON match_events(match_id, event_type);
CREATE INDEX IF NOT EXISTS live_snapshots_match_captured_idx ON live_snapshots(match_id, captured_at DESC);
