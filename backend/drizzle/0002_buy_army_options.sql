ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "buy_army_options" jsonb;--> statement-breakpoint
DELETE FROM "reservations" WHERE "service_id" IN (SELECT "id" FROM "services" WHERE "slug" = 'wh_buy_army');--> statement-breakpoint
DELETE FROM "services" WHERE "slug" = 'wh_buy_army';--> statement-breakpoint
ALTER TYPE "public"."service_slugs" RENAME TO "service_slugs_old";--> statement-breakpoint
CREATE TYPE "public"."service_slugs" AS ENUM('club_visit', 'dnd_game', 'wh_game', 'wh_group_training', 'wh_solo_training', 'wh_painting');--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "slug" TYPE "public"."service_slugs" USING "slug"::text::"public"."service_slugs";--> statement-breakpoint
DROP TYPE "public"."service_slugs_old";
