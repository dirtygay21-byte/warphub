CREATE TABLE IF NOT EXISTS notification_log (
  id serial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  telegram_id bigint NOT NULL,
  kind varchar NOT NULL,
  broadcast_id integer,
  ok boolean NOT NULL,
  reason varchar,
  status integer,
  description text
);
CREATE INDEX IF NOT EXISTS notification_log_tg_at_index ON notification_log(telegram_id, at);
CREATE INDEX IF NOT EXISTS notification_log_kind_at_index ON notification_log(kind, at);
CREATE TABLE IF NOT EXISTS notification_outbox (
  id serial PRIMARY KEY,
  telegram_id bigint NOT NULL,
  kind varchar NOT NULL,
  text text NOT NULL,
  image_url text,
  buttons jsonb,
  broadcast_id integer,
  not_before timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_outbox_not_before_index ON notification_outbox(not_before);
CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  opponent_games jsonb NOT NULL DEFAULT '[]'::jsonb,
  news boolean NOT NULL DEFAULT true,
  events boolean NOT NULL DEFAULT true,
  promos boolean NOT NULL DEFAULT true,
  eve_reminder boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_templates (
  kind varchar PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_marks (
  key varchar PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS broadcasts (
  id serial PRIMARY KEY,
  title varchar NOT NULL,
  text text NOT NULL,
  image_url text,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  audience jsonb NOT NULL,
  schedule jsonb NOT NULL,
  status varchar NOT NULL DEFAULT 'draft',
  next_run_at timestamptz,
  last_run_at timestamptz,
  runs integer NOT NULL DEFAULT 0,
  last_recipients integer,
  created_by bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
