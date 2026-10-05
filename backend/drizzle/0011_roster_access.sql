-- Roster Builder: одноразовые коды доступа, список пользователей с доступом, попытки ввода кода.

CREATE TABLE IF NOT EXISTS "roster_access_codes" (
  "id" serial PRIMARY KEY,
  "code_hash" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "used_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "revoked_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_access_codes_hash_idx" ON "roster_access_codes" ("code_hash");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "roster_access" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "granted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "code_id" integer REFERENCES "roster_access_codes"("id") ON DELETE SET NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "roster_code_attempts" (
  "id" serial PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "success" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_code_attempts_user_time_idx" ON "roster_code_attempts" ("user_id", "created_at");
