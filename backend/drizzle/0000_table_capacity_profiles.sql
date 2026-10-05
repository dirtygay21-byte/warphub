CREATE TYPE "public"."table_capacity_profile" AS ENUM('small', 'large');--> statement-breakpoint
DROP TABLE IF EXISTS "services_tables";--> statement-breakpoint
ALTER TABLE "tables" DROP COLUMN IF EXISTS "seat_capacity";--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "table_capacity_profile" "table_capacity_profile";--> statement-breakpoint
UPDATE "services" SET "table_capacity_profile" = 'small' WHERE "slug" IN ('wh_game', 'wh_group_training', 'wh_solo_training');--> statement-breakpoint
UPDATE "services" SET "table_capacity_profile" = 'large' WHERE "slug" IN ('dnd_game', 'wh_painting');--> statement-breakpoint
UPDATE "services" SET "table_capacity_profile" = NULL WHERE "slug" IN ('club_visit', 'wh_buy_army');--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "service_id" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "party_size" integer;--> statement-breakpoint
DELETE FROM "reservations" WHERE "service_id" IS NULL;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "service_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "reservations" DROP CONSTRAINT IF EXISTS "reservations_table_party_size_check";--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_party_size_check" CHECK (("reservations"."table_id" is null or ("reservations"."party_size" is not null and "reservations"."party_size" > 0)));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservations_service_id_index" ON "reservations" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservations_table_id_time_range_index" ON "reservations" USING btree ("table_id","starts_at","ends_at");--> statement-breakpoint
INSERT INTO "tables" ("name")
SELECT seed.name
FROM (VALUES ('Стол 1'), ('Стол 2'), ('Стол 3')) AS seed(name)
WHERE NOT EXISTS (
  SELECT 1 FROM "tables" WHERE "tables"."name" = seed.name
);
