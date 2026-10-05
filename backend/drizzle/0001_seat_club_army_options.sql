ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "seat_club_army_options" jsonb;--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN IF EXISTS "rents_club_army";
