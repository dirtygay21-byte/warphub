ALTER TABLE "disciplines" ADD COLUMN "schedule_weekdays" integer[] DEFAULT '{1,2,3,4,5,6,7}' NOT NULL;--> statement-breakpoint
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_schedule_weekdays_check" CHECK ("disciplines"."schedule_weekdays" <@ ARRAY[1,2,3,4,5,6,7]::integer[] AND cardinality("disciplines"."schedule_weekdays") > 0);--> statement-breakpoint
UPDATE "disciplines" SET "schedule_weekdays" = '{1,2,3,4}' WHERE "slug" = 'dnd';--> statement-breakpoint
UPDATE "disciplines" SET "schedule_weekdays" = '{5,6,7}' WHERE "slug" = 'wh';
