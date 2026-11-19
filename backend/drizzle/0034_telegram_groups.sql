-- Доступ к WarpBuilder через группу подписчиков Boosty (17.11.2026): группы бота и участники группы.
CREATE TABLE IF NOT EXISTS "telegram_groups" (
  "chat_id" bigint PRIMARY KEY NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "type" text DEFAULT 'group' NOT NULL,
  "bot_status" text DEFAULT 'member' NOT NULL,
  "purpose" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "telegram_group_members" (
  "chat_id" bigint NOT NULL,
  "telegram_id" bigint NOT NULL,
  "is_member" boolean NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "telegram_group_members_pk" PRIMARY KEY ("chat_id", "telegram_id")
);
