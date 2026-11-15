CREATE TABLE game_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game varchar(16) NOT NULL,
  service_id integer NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  table_id integer REFERENCES tables(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  player_a uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_b uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outcome varchar(8) CHECK (outcome IN ('a', 'b', 'draw')),
  status varchar(16) NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'reported', 'confirmed', 'disputed', 'void')),
  reported_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reported_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by varchar(16),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX game_results_game_slot_unique ON game_results(service_id, table_id, starts_at);
CREATE INDEX game_results_player_a_index ON game_results(player_a);
CREATE INDEX game_results_player_b_index ON game_results(player_b);
CREATE INDEX game_results_status_index ON game_results(status);
