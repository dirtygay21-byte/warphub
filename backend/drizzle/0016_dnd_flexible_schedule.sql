-- D&D: игра без точного времени — дни недели и время суток (24.10.2026). Повторный запуск безопасен.
ALTER TABLE "dnd_games" ALTER COLUMN "starts_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dnd_games" ADD COLUMN IF NOT EXISTS "days_of_week" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "dnd_games" ADD COLUMN IF NOT EXISTS "times_of_day" varchar[] DEFAULT '{}'::varchar[] NOT NULL;--> statement-breakpoint
ALTER TABLE "dnd_games" DROP CONSTRAINT IF EXISTS "dnd_games_schedule_check";--> statement-breakpoint
ALTER TABLE "dnd_games" ADD CONSTRAINT "dnd_games_schedule_check" CHECK ("dnd_games"."starts_at" is not null or (cardinality("dnd_games"."days_of_week") > 0 and cardinality("dnd_games"."times_of_day") > 0));
