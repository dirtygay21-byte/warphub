-- Кампания Dominatus в WarpHub (DM2, 31.10.2026). Повторный запуск безопасен.
CREATE TABLE IF NOT EXISTS "dominatus_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"winner_alliance" varchar(16),
	"created_by_telegram_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
CREATE TABLE IF NOT EXISTS "dominatus_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL REFERENCES "dominatus_campaigns"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"alliance" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "dominatus_players_campaign_user" ON "dominatus_players" ("campaign_id", "user_id");
CREATE TABLE IF NOT EXISTS "dominatus_phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL REFERENCES "dominatus_campaigns"("id") ON DELETE CASCADE,
	"phase" integer NOT NULL,
	"location_id" varchar(40),
	"location_roll" integer,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"controller" varchar(16),
	"ascendant" text[] DEFAULT '{}'::text[] NOT NULL,
	"narrative" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "dominatus_phases_campaign_phase" ON "dominatus_phases" ("campaign_id", "phase");
CREATE TABLE IF NOT EXISTS "dominatus_battles" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL REFERENCES "dominatus_campaigns"("id") ON DELETE CASCADE,
	"phase" integer NOT NULL,
	"location_id" varchar(40),
	"game_key" varchar(80) NOT NULL,
	"player1_id" integer NOT NULL REFERENCES "dominatus_players"("id") ON DELETE CASCADE,
	"player2_id" integer NOT NULL REFERENCES "dominatus_players"("id") ON DELETE CASCADE,
	"vp1" integer NOT NULL,
	"vp2" integer NOT NULL,
	"result" varchar(8) NOT NULL,
	"agenda1" varchar(60),
	"agenda2" varchar(60),
	"achieved1" integer DEFAULT 0 NOT NULL,
	"achieved2" integer DEFAULT 0 NOT NULL,
	"details" jsonb,
	"recorded_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "dominatus_battles_game_key" ON "dominatus_battles" ("campaign_id", "game_key");
CREATE INDEX IF NOT EXISTS "dominatus_battles_campaign_phase" ON "dominatus_battles" ("campaign_id", "phase");
CREATE TABLE IF NOT EXISTS "dominatus_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL REFERENCES "dominatus_campaigns"("id") ON DELETE CASCADE,
	"player_id" integer NOT NULL REFERENCES "dominatus_players"("id") ON DELETE CASCADE,
	"kind" varchar(16) NOT NULL,
	"name" varchar(80),
	"phase" integer NOT NULL,
	"battle_id" integer REFERENCES "dominatus_battles"("id") ON DELETE CASCADE,
	"source" varchar(16) NOT NULL,
	"draw" integer DEFAULT 1 NOT NULL,
	"note" varchar(200),
	"discarded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "dominatus_cards_player" ON "dominatus_cards" ("player_id");
