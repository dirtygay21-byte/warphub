-- Категории столов (решение владельца 05.11.2026): столы 1–2 — Full-scale Wargaming (Warhammer 40,000, AoS),
-- столы 3–4 — Tactical Games (Kill Team, Warcry). Существующие столы не меняются: по умолчанию категория wh.
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "category" varchar NOT NULL DEFAULT 'wh';--> statement-breakpoint
ALTER TABLE "tables" DROP CONSTRAINT IF EXISTS "tables_category_check";--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_category_check" CHECK ("category" IN ('wh', 'small'));--> statement-breakpoint

-- Столы 3 и 4 — Tactical Games: создать, если их нет; если есть — включить и отнести к категории.
INSERT INTO "tables" ("name", "is_active", "category")
SELECT v.name, true, 'small'
FROM (VALUES ('Стол 3'), ('Стол 4')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM "tables" t WHERE t.name = v.name);--> statement-breakpoint
UPDATE "tables" SET "category" = 'small', "is_active" = true WHERE "name" IN ('Стол 3', 'Стол 4');
