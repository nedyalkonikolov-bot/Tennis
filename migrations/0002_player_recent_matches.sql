CREATE TABLE IF NOT EXISTS player_recent_matches (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_key TEXT,
  tour TEXT NOT NULL CHECK (tour IN ('ATP', 'WTA')),
  match_date TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  tournament TEXT,
  surface TEXT,
  opponent_name TEXT NOT NULL,
  opponent_key TEXT,
  score TEXT,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss')),
  event_status TEXT,
  source TEXT NOT NULL DEFAULT 'api-tennis',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_player_recent_matches_player_date ON player_recent_matches(player_id, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_recent_matches_tour_date ON player_recent_matches(tour, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_recent_matches_source_event ON player_recent_matches(source_event_id);
