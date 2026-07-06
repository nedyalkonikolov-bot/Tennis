function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=120" },
  });
}

async function count(db, table) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row?.count || 0;
}

async function safeCount(db, table) {
  try {
    return await count(db, table);
  } catch {
    return 0;
  }
}

async function safeScalar(db, sql, fallback = 0) {
  try {
    const row = await db.prepare(sql).first();
    return row?.count || fallback;
  } catch {
    return fallback;
  }
}

export async function onRequestGet({ env }) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  const db = env.TENNIS_DB;
  const accuracy = await db.prepare(`
    SELECT
      COUNT(*) AS settled,
      SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct
    FROM prediction_outcomes
    WHERE result_status = 'settled'
  `).first();
  await db.prepare(`
    UPDATE sync_runs
    SET status = 'error',
        finished_at = datetime('now'),
        error = COALESCE(error, 'Sync exceeded Cloudflare execution window')
    WHERE status = 'running'
      AND started_at < datetime('now', '-10 minutes')
  `).run().catch(() => null);
  const latestSync = await db.prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1").first();

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    counts: {
      players: await count(db, "players"),
      playerStatSnapshots: await count(db, "player_stat_snapshots"),
      playerRecentMatches: await safeCount(db, "player_recent_matches"),
      matches: await count(db, "matches"),
      predictions: await count(db, "predictions"),
      settledOutcomes: accuracy?.settled || 0,
      syncRuns: await count(db, "sync_runs"),
      members: await safeCount(db, "members"),
      activeMembers: await safeScalar(db, "SELECT COUNT(*) AS count FROM members WHERE status = 'active'"),
    },
    predictionAccuracy: {
      settled: accuracy?.settled || 0,
      correct: accuracy?.correct || 0,
      percent: accuracy?.settled ? Math.round((accuracy.correct / accuracy.settled) * 1000) / 10 : null,
    },
    latestSync,
  });
}
