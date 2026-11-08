CREATE TABLE point_promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone integer NOT NULL CHECK (milestone > 0),
  code varchar NOT NULL,
  percent double precision NOT NULL DEFAULT 25 CHECK (percent > 0 AND percent <= 100),
  label text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX point_promo_codes_code_unique ON point_promo_codes(code);
CREATE UNIQUE INDEX point_promo_codes_user_milestone_unique ON point_promo_codes(user_id, milestone);
CREATE INDEX point_promo_codes_user_index ON point_promo_codes(user_id);
