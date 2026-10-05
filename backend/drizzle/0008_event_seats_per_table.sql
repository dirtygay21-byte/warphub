ALTER TABLE "events" ADD COLUMN "seats_per_table" integer;--> statement-breakpoint
UPDATE "events" e
SET "seats_per_table" = GREATEST(
  1,
  CASE
    WHEN (
      SELECT COUNT(*)::integer
      FROM "events_tables" et
      WHERE et.event_id = e.id
    ) > 0 THEN e.capacity / (
      SELECT COUNT(*)::integer
      FROM "events_tables" et
      WHERE et.event_id = e.id
    )
    ELSE e.capacity
  END
);--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "seats_per_table" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "capacity";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_seats_per_table_check" CHECK ("events"."seats_per_table" > 0);
