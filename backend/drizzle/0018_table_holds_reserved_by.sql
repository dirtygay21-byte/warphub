-- Бронь стола: «Кто бронирует» (30.10.2026). Повторный запуск безопасен.
ALTER TABLE "table_holds" ADD COLUMN IF NOT EXISTS "reserved_by" varchar(100);
