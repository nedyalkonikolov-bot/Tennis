CREATE TABLE IF NOT EXISTS seo_articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  excerpt TEXT,
  body_html TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL UNIQUE,
  source_url TEXT,
  source_title TEXT,
  related_prediction_id TEXT,
  keywords_json TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_seo_articles_created ON seo_articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_articles_status ON seo_articles(status, created_at DESC);
