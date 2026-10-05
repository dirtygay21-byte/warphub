ALTER TABLE "users_events" ADD COLUMN IF NOT EXISTS "party_size" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users_events" ADD CONSTRAINT "users_events_party_size_check" CHECK ("party_size" > 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
