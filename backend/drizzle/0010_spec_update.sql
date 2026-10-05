-- ТЗ «Warp Hub»: 2 стола WH, сессии игроков, покраска с общей вместимостью,
-- данные игрока, расписание пт–вс, игры и заявки D&D.

-- 1. Вместимость на уровне услуги
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "seats_per_table" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "pool_capacity" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "has_trainer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_seats_per_table_check";--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_seats_per_table_check" CHECK ("services"."seats_per_table" is null or "services"."seats_per_table" > 0);--> statement-breakpoint
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_pool_capacity_check";--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_pool_capacity_check" CHECK ("services"."pool_capacity" is null or "services"."pool_capacity" > 0);--> statement-breakpoint

-- Игра: 2 игрока за столом. Групповая тренировка: 2 игрока + тренер. Индивидуальная: 1 игрок + тренер.
UPDATE "services" SET "seats_per_table" = 2, "has_trainer" = false WHERE "slug" = 'wh_game';--> statement-breakpoint
UPDATE "services" SET "seats_per_table" = 2, "has_trainer" = true WHERE "slug" = 'wh_group_training';--> statement-breakpoint
UPDATE "services" SET "seats_per_table" = 1, "has_trainer" = true WHERE "slug" = 'wh_solo_training';--> statement-breakpoint

-- Покраска: отдельная вместимость 5 человек, без выбора стола.
UPDATE "services" SET "pool_capacity" = 5, "table_capacity_profile" = NULL WHERE "slug" = 'wh_painting';--> statement-breakpoint
UPDATE "reservations" SET "table_id" = NULL WHERE "service_id" IN (SELECT "id" FROM "services" WHERE "slug" = 'wh_painting');--> statement-breakpoint

-- Посещение клуба: прежние 25 мест, теперь как настройка услуги.
UPDATE "services" SET "pool_capacity" = 25 WHERE "slug" = 'club_visit' AND "pool_capacity" IS NULL;--> statement-breakpoint

-- Запись на стол D&D заменяется играми и заявками D&D.
UPDATE "services" SET "is_active" = false WHERE "slug" = 'dnd_game';--> statement-breakpoint

-- 2. Только два стола: все активные столы, кроме двух первых, скрываются.
UPDATE "tables" SET "is_active" = false
WHERE "is_active" = true
  AND "id" NOT IN (
    SELECT "id" FROM "tables" WHERE "is_active" = true ORDER BY "id" LIMIT 2
  );--> statement-breakpoint

-- 3. Расписание: всё, кроме D&D, — пятница–воскресенье.
UPDATE "disciplines" SET "schedule_weekdays" = '{5,6,7}' WHERE "slug" IN ('wh', 'club');--> statement-breakpoint

-- 4. Данные игрока / формы покраски
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "details" jsonb;--> statement-breakpoint

-- 5. D&D: игры
CREATE TABLE IF NOT EXISTS "dnd_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"game_type" varchar NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"capacity" integer NOT NULL,
	"image_url" text,
	"status" varchar DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dnd_games_capacity_check" CHECK ("dnd_games"."capacity" > 0),
	CONSTRAINT "dnd_games_status_check" CHECK ("dnd_games"."status" in ('draft', 'open', 'closed', 'cancelled')),
	CONSTRAINT "dnd_games_ends_at_check" CHECK ("dnd_games"."ends_at" is null or "dnd_games"."ends_at" > "dnd_games"."starts_at")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dnd_games_starts_at_index" ON "dnd_games" USING btree ("starts_at");--> statement-breakpoint

-- 6. D&D: записи на игры
CREATE TABLE IF NOT EXISTS "dnd_game_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"time_is_convenient" boolean NOT NULL,
	"experience_level" varchar,
	"status" varchar DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "dnd_game_bookings_quantity_check" CHECK ("dnd_game_bookings"."quantity" > 0),
	CONSTRAINT "dnd_game_bookings_status_check" CHECK ("dnd_game_bookings"."status" in ('active', 'cancelled'))
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dnd_game_bookings" ADD CONSTRAINT "dnd_game_bookings_game_id_dnd_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."dnd_games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dnd_game_bookings" ADD CONSTRAINT "dnd_game_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dnd_game_bookings_game_id_index" ON "dnd_game_bookings" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dnd_game_bookings_user_id_index" ON "dnd_game_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dnd_game_bookings_active_unique" ON "dnd_game_bookings" USING btree ("game_id","user_id") WHERE "dnd_game_bookings"."status" = 'active';--> statement-breakpoint

-- 7. D&D: заявки «Хочу попробовать»
CREATE TABLE IF NOT EXISTS "dnd_trial_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"players_count" integer NOT NULL,
	"preferred_times" varchar[] DEFAULT '{}'::varchar[] NOT NULL,
	"experience_level" varchar,
	"is_private" boolean DEFAULT false NOT NULL,
	"notes" text,
	"status" varchar DEFAULT 'new' NOT NULL,
	"game_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dnd_trial_requests_players_count_check" CHECK ("dnd_trial_requests"."players_count" > 0 and "dnd_trial_requests"."players_count" <= 20),
	CONSTRAINT "dnd_trial_requests_status_check" CHECK ("dnd_trial_requests"."status" in ('new', 'grouped', 'cancelled'))
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dnd_trial_requests" ADD CONSTRAINT "dnd_trial_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dnd_trial_requests" ADD CONSTRAINT "dnd_trial_requests_game_id_dnd_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."dnd_games"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dnd_trial_requests_user_id_index" ON "dnd_trial_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dnd_trial_requests_status_index" ON "dnd_trial_requests" USING btree ("status");
