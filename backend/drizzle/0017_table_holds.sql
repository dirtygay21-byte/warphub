-- Бронь столов администратором (30.10.2026): стол закрыт для записи на интервал. Повторный запуск безопасен.
CREATE TABLE IF NOT EXISTS "table_holds" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_id" integer NOT NULL REFERENCES "tables"("id"),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"purpose" varchar(20) NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text,
	"dnd_game_id" integer REFERENCES "dnd_games"("id") ON DELETE SET NULL,
	"created_by_telegram_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_holds_interval_check" CHECK ("table_holds"."ends_at" > "table_holds"."starts_at")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_holds_table_time_idx" ON "table_holds" USING btree ("table_id","starts_at");
