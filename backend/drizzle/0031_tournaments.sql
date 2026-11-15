CREATE TABLE tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  game varchar(16) NOT NULL,
  rounds integer NOT NULL CHECK (rounds BETWEEN 1 AND 10),
  status varchar(16) NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'running', 'finished')),
  seed integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tournaments_event_unique ON tournaments(event_id);

CREATE TABLE tournament_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name varchar(80) NOT NULL,
  army varchar(80),
  dropped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tournament_players_tournament_index ON tournament_players(tournament_id);

CREATE TABLE tournament_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round integer NOT NULL,
  table_no integer NOT NULL,
  player_a uuid NOT NULL REFERENCES tournament_players(id) ON DELETE CASCADE,
  player_b uuid REFERENCES tournament_players(id) ON DELETE CASCADE,
  result varchar(8) CHECK (result IN ('a', 'b', 'draw')),
  vp_a integer,
  vp_b integer,
  reported_at timestamptz,
  note text
);
CREATE INDEX tournament_games_tournament_index ON tournament_games(tournament_id, round);

ALTER TABLE game_results ALTER COLUMN service_id DROP NOT NULL;
ALTER TABLE game_results ADD COLUMN tournament_game_id uuid;
CREATE UNIQUE INDEX game_results_tournament_game_unique ON game_results(tournament_game_id);
