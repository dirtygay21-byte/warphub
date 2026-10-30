-- Поддержка клуба (30.10.2026): особое звание игрока. Повторный запуск безопасен.
CREATE TABLE IF NOT EXISTS "club_supporters" (
	"user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"title" varchar(16) NOT NULL,
	"granted_by_telegram_id" bigint NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
