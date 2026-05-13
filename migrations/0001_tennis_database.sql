PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  player_key TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  tour TEXT NOT NULL CHECK (tour IN ('ATP', 'WTA')),
  country TEXT,
  current_rank INTEGER,
  points INTEGER DEFAULT 0,
  movement TEXT,
  form_rating INTEGER DEFAULT 50,
  hold_rate INTEGER DEFAULT 0,
  break_rate INTEGER DEFAULT 0,
  clay_rating INTEGER DEFAULT 0,
  hard_rating INTEGER DEFAULT 0,
  grass_rating INTEGER DEFAULT 0,
  source TEXT DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_tour_name ON players(tour, normalized_name);
CREATE INDEX IF NOT EXISTS idx_players_tour_rank ON players(tour, current_rank);

CREATE TABLE IF NOT EXISTS player_stat_snapshots (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  rank INTEGER,
  points INTEGER DEFAULT 0,
  form_rating INTEGER DEFAULT 50,
  hold_rate INTEGER DEFAULT 0,
  break_rate INTEGER DEFAULT 0,
  clay_rating INTEGER DEFAULT 0,
  hard_rating INTEGER DEFAULT 0,
  grass_rating INTEGER DEFAULT 0,
  source TEXT DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_player_stat_snapshots_date ON player_stat_snapshots(snapshot_date);

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

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'cloudbet',
  source_event_id TEXT NOT NULL,
  tour TEXT CHECK (tour IN ('ATP', 'WTA')),
  tournament TEXT,
  start_time TEXT,
  status TEXT DEFAULT 'Scheduled',
  live INTEGER NOT NULL DEFAULT 0,
  surface TEXT,
  player_a_id TEXT REFERENCES players(id),
  player_b_id TEXT REFERENCES players(id),
  player_a_name TEXT NOT NULL,
  player_b_name TEXT NOT NULL,
  normalized_player_a TEXT NOT NULL,
  normalized_player_b TEXT NOT NULL,
  score TEXT,
  winner_player_id TEXT REFERENCES players(id),
  winner_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_status_start ON matches(status, start_time);
CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(normalized_player_a, normalized_player_b);
CREATE INDEX IF NOT EXISTS idx_matches_tour ON matches(tour);

CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL DEFAULT 'v1',
  source TEXT NOT NULL DEFAULT 'tennistipz',
  predicted_winner_id TEXT REFERENCES players(id),
  predicted_winner_name TEXT NOT NULL,
  predicted_side TEXT,
  confidence INTEGER NOT NULL,
  predicted_odds TEXT,
  model_edge REAL,
  factors_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(match_id, model_version)
);

CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions(created_at);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);

CREATE TABLE IF NOT EXISTS prediction_outcomes (
  prediction_id TEXT PRIMARY KEY REFERENCES predictions(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  actual_winner_id TEXT REFERENCES players(id),
  actual_winner_name TEXT,
  result_status TEXT NOT NULL DEFAULT 'pending',
  correct INTEGER,
  score TEXT,
  settled_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_status ON prediction_outcomes(result_status);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_correct ON prediction_outcomes(correct);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  players_upserted INTEGER DEFAULT 0,
  matches_upserted INTEGER DEFAULT 0,
  predictions_upserted INTEGER DEFAULT 0,
  outcomes_settled INTEGER DEFAULT 0,
  message TEXT,
  error TEXT
);
