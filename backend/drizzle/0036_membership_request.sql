-- Игрок в «Моих записях» отметил «я член клуба» (21.11.2026): скидку 10% подтверждает администратор в счёте.
ALTER TABLE "reservation_pricing" ADD COLUMN IF NOT EXISTS "membership_requested_at" timestamp with time zone;
