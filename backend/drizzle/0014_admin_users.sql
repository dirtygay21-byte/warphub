-- Администраторы, добавленные в админке по Telegram ID (N2)
CREATE TABLE IF NOT EXISTS "admin_users" (
	"telegram_id" bigint PRIMARY KEY NOT NULL,
	"note" varchar(100),
	"added_by_telegram_id" bigint NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
