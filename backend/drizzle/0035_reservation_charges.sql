-- Позиции счёта (20.11.2026, решение владельца): услуга + аренда стола отдельными строками, администратор может их поменять.
-- Только новые записи считаются по позициям (itemized); старые счета не меняются, пока их не поправят вручную.
ALTER TABLE "reservation_pricing" ADD COLUMN IF NOT EXISTS "itemized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservation_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL REFERENCES "reservations"("id") ON DELETE cascade,
	"kind" varchar NOT NULL,
	"service_id" integer REFERENCES "services"("id") ON DELETE set null,
	"title" text NOT NULL,
	"unit_price" double precision NOT NULL,
	"share" double precision DEFAULT 1 NOT NULL,
	"amount" double precision NOT NULL,
	"auto" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_charges_kind_check" CHECK ("kind" IN ('service', 'table'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_charges_reservation_index" ON "reservation_charges" ("reservation_id", "position");
