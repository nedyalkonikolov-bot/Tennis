ALTER TABLE players ADD COLUMN player_bday TEXT;
ALTER TABLE players ADD COLUMN player_logo TEXT;

CREATE TABLE IF NOT EXISTS player_season_stats (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_key TEXT,
  tour TEXT NOT NULL CHECK (tour IN ('ATP', 'WTA')),
  season TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'singles',
  season_rank INTEGER,
  titles INTEGER DEFAULT 0,
  matches_won INTEGER DEFAULT 0,
  matches_lost INTEGER DEFAULT 0,
  hard_won INTEGER DEFAULT 0,
  hard_lost INTEGER DEFAULT 0,
  clay_won INTEGER DEFAULT 0,
  clay_lost INTEGER DEFAULT 0,
  grass_won INTEGER DEFAULT 0,
  grass_lost INTEGER DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'api-tennis-get-players',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, season, type)
);

CREATE INDEX IF NOT EXISTS idx_player_season_stats_player_season ON player_season_stats(player_id, season DESC, type);
CREATE INDEX IF NOT EXISTS idx_player_season_stats_tour_season ON player_season_stats(tour, season DESC, type);
