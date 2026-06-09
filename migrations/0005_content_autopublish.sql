ALTER TABLE seo_articles ADD COLUMN content_type TEXT;
ALTER TABLE seo_articles ADD COLUMN published_at TEXT;
ALTER TABLE seo_articles ADD COLUMN seo_json TEXT;
ALTER TABLE seo_articles ADD COLUMN tags_json TEXT;
ALTER TABLE seo_articles ADD COLUMN related_players_json TEXT;
ALTER TABLE seo_articles ADD COLUMN related_tournament TEXT;
ALTER TABLE seo_articles ADD COLUMN featured_image_prompt TEXT;
ALTER TABLE seo_articles ADD COLUMN facts_used_json TEXT;
ALTER TABLE seo_articles ADD COLUMN missing_data_json TEXT;
ALTER TABLE seo_articles ADD COLUMN quality_score REAL;

CREATE INDEX IF NOT EXISTS idx_seo_articles_published_at ON seo_articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_articles_content_type ON seo_articles(content_type, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_articles_related_prediction ON seo_articles(related_prediction_id, published_at DESC);

CREATE TABLE IF NOT EXISTS content_automation_runs (
  id TEXT PRIMARY KEY,
  run_date TEXT NOT NULL,
  requested_json TEXT NOT NULL,
  published_json TEXT NOT NULL,
  skipped_json TEXT NOT NULL,
  failed_json TEXT NOT NULL,
  model TEXT,
  errors_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_automation_runs_date ON content_automation_runs(run_date DESC);
