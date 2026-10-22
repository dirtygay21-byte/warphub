-- Мини-игры: попытки, награды (1 в неделю на игру), настройки из админки
CREATE TABLE IF NOT EXISTS "minigame_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game" varchar NOT NULL,
	"status" varchar DEFAULT 'started' NOT NULL,
	"state" text,
	"score" integer,
	"reject_reason" varchar,
	"reward_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "minigame_sessions_status_check" CHECK ("minigame_sessions"."status" in ('started', 'finished', 'rejected'))
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "minigame_sessions" ADD CONSTRAINT "minigame_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "minigame_sessions_user_game_index" ON "minigame_sessions" USING btree ("user_id","game","started_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "minigame_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game" varchar NOT NULL,
	"session_id" uuid,
	"week_key" varchar NOT NULL,
	"tier_rank" integer NOT NULL,
	"score" integer NOT NULL,
	"reward_type" varchar NOT NULL,
	"reward_value" double precision NOT NULL,
	"label" varchar NOT NULL,
	"code" varchar NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "minigame_rewards" ADD CONSTRAINT "minigame_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "minigame_rewards" ADD CONSTRAINT "minigame_rewards_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "minigame_rewards_code_unique" ON "minigame_rewards" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "minigame_rewards_user_game_week_unique" ON "minigame_rewards" USING btree ("user_id","game","week_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "minigame_rewards_user_index" ON "minigame_rewards" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "minigame_settings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"settings" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "minigame_settings" ADD CONSTRAINT "minigame_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
