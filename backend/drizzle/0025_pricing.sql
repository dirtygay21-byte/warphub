CREATE TABLE service_prices (
  id serial PRIMARY KEY,
  service_id integer NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  billing_mode varchar NOT NULL,
  unit_price double precision NOT NULL CHECK (unit_price >= 0),
  army_rental_price_per_1000 double precision NOT NULL DEFAULT 1000 CHECK (army_rental_price_per_1000 >= 0),
  third_game_discount_percent double precision NOT NULL DEFAULT 0 CHECK (third_game_discount_percent >= 0 AND third_game_discount_percent <= 100),
  effective_from timestamptz NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_prices_billing_mode_check CHECK (billing_mode IN ('per_guest', 'per_table', 'per_pair'))
);
CREATE INDEX service_prices_service_effective_index ON service_prices(service_id, effective_from);

CREATE TABLE reservation_pricing (
  reservation_id uuid PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  billing_mode varchar NOT NULL,
  unit_price double precision NOT NULL CHECK (unit_price >= 0),
  base_amount double precision NOT NULL CHECK (base_amount >= 0),
  army_rental_points integer NOT NULL DEFAULT 0 CHECK (army_rental_points >= 0),
  army_rental_price_per_1000 double precision NOT NULL DEFAULT 0 CHECK (army_rental_price_per_1000 >= 0),
  army_rental_amount double precision NOT NULL DEFAULT 0 CHECK (army_rental_amount >= 0),
  total_amount double precision NOT NULL CHECK (total_amount >= 0),
  paid_amount double precision NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_pricing_billing_mode_check CHECK (billing_mode IN ('per_guest', 'per_table', 'per_pair')),
  CONSTRAINT reservation_pricing_paid_total_check CHECK (paid_amount <= total_amount)
);

CREATE TABLE reservation_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  kind varchar NOT NULL,
  percent double precision CHECK (percent >= 0 AND percent <= 100),
  amount double precision CHECK (amount >= 0),
  reward_id uuid REFERENCES minigame_rewards(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_discounts_kind_check CHECK (kind IN ('training', 'membership', 'reward', 'manual')),
  CONSTRAINT reservation_discounts_value_check CHECK ((percent IS NOT NULL) <> (amount IS NOT NULL))
);
CREATE INDEX reservation_discounts_reservation_index ON reservation_discounts(reservation_id);
CREATE UNIQUE INDEX reservation_discounts_reward_unique ON reservation_discounts(reward_id);

CREATE TABLE reservation_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  amount double precision NOT NULL CHECK (amount > 0),
  method varchar NOT NULL,
  note text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_payments_method_check CHECK (method IN ('cash', 'card', 'transfer', 'other'))
);
CREATE INDEX reservation_payments_reservation_index ON reservation_payments(reservation_id, created_at);
