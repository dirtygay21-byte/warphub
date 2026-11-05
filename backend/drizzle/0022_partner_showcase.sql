-- Partner showcase: editable footer and two independently sorted, unlimited card lanes.
CREATE TABLE IF NOT EXISTS "partner_settings" (
  "id" integer PRIMARY KEY,
  "partner1_title" varchar(120) NOT NULL DEFAULT 'Партнёр 1',
  "partner2_title" varchar(120) NOT NULL DEFAULT 'Партнёр 2',
  "footer_text" text NOT NULL DEFAULT 'Мини-ки по скидке',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "partner_cards" (
  "id" serial PRIMARY KEY,
  "lane" integer NOT NULL,
  "title" varchar(180) NOT NULL,
  "text" text NOT NULL DEFAULT '',
  "url" text NOT NULL,
  "image_url" text NOT NULL DEFAULT '',
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "partner_cards_lane_check" CHECK ("lane" in (1, 2)),
  CONSTRAINT "partner_cards_sort_order_check" CHECK ("sort_order" >= 0)
);

CREATE INDEX IF NOT EXISTS "partner_cards_lane_sort_order_idx" ON "partner_cards" ("lane", "sort_order", "id");

INSERT INTO "partner_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
