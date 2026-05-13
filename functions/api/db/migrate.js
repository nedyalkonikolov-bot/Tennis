function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isAuthorized(request, env) {
  if (!env.DATABASE_SYNC_TOKEN) return false;
  const url = new URL(request.url);
  const token = request.headers.get("x-sync-token") || url.searchParams.get("token");
  return token && token === env.DATABASE_SYNC_TOKEN;
}

async function columnExists(db, tableName, columnName) {
  const info = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  return (info.results || []).some((column) => column.name === columnName);
}

async function migrate(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

  const db = env.TENNIS_DB;
  const applied = [];

  await db.batch([
    db.prepare(`
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
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_player_recent_matches_player_date ON player_recent_matches(player_id, match_date DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_player_recent_matches_tour_date ON player_recent_matches(tour, match_date DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_player_recent_matches_source_event ON player_recent_matches(source_event_id)"),
  ]);
  applied.push("player_recent_matches");

  if (!(await columnExists(db, "sync_runs", "recent_matches_upserted"))) {
    await db.prepare("ALTER TABLE sync_runs ADD COLUMN recent_matches_upserted INTEGER DEFAULT 0").run();
    applied.push("sync_runs.recent_matches_upserted");
  }

  return jsonResponse({ ok: true, applied, migratedAt: new Date().toISOString() });
}

export async function onRequestPost({ request, env }) {
  return migrate(request, env);
}

export async function onRequestGet({ request, env }) {
  return migrate(request, env);
}
