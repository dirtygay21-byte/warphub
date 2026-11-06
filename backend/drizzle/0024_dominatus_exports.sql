CREATE TABLE "dominatus_exports" (
  "id" serial PRIMARY KEY,
  "game_key" varchar(80) NOT NULL UNIQUE,
  "campaign_id" integer NOT NULL REFERENCES "dominatus_campaigns" ("id") ON DELETE cascade,
  "battle_id" integer NOT NULL REFERENCES "dominatus_battles" ("id") ON DELETE cascade,
  "payload" jsonb NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "battle_id_on_site" text,
  "next_attempt_at" timestamp with time zone NOT NULL DEFAULT now(),
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dominatus_exports_status_check" CHECK ("status" in ('pending', 'sending', 'applied', 'retry', 'dead'))
);

CREATE INDEX "dominatus_exports_status_next_attempt" ON "dominatus_exports" ("status", "next_attempt_at");
