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

async function cleanup(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

  const db = env.TENNIS_DB;
  const oldMatches = await db.prepare(`
    SELECT id
    FROM matches
    WHERE start_time IS NOT NULL
      AND date(substr(start_time, 1, 10)) < date('now', '-2 years')
  `).all();
  const oldMatchIds = (oldMatches.results || []).map((row) => row.id).filter(Boolean);
  const oldPredictions = oldMatchIds.length
    ? await db.prepare(`
      SELECT COUNT(*) AS count
      FROM predictions
      WHERE match_id IN (${oldMatchIds.map(() => "?").join(",")})
    `).bind(...oldMatchIds).first()
    : { count: 0 };

  for (let index = 0; index < oldMatchIds.length; index += 50) {
    const batch = oldMatchIds.slice(index, index + 50);
    const placeholders = batch.map(() => "?").join(",");
    await db.batch([
      db.prepare(`DELETE FROM prediction_outcomes WHERE match_id IN (${placeholders})`).bind(...batch),
      db.prepare(`DELETE FROM predictions WHERE match_id IN (${placeholders})`).bind(...batch),
      db.prepare(`DELETE FROM matches WHERE id IN (${placeholders})`).bind(...batch),
    ]);
  }

  const before = await db.prepare("SELECT COUNT(*) AS count FROM player_recent_matches WHERE source <> 'api-tennis-fixtures'").first();
  await env.TENNIS_DB.prepare("DELETE FROM player_recent_matches WHERE source <> 'api-tennis-fixtures'").run();
  const staleRecent = await db.prepare("DELETE FROM player_recent_matches WHERE match_date < date('now', '-2 years')").run();
  const after = await db.prepare("SELECT COUNT(*) AS count FROM player_recent_matches").first();

  return jsonResponse({
    ok: true,
    removed: before?.count || 0,
    remaining: after?.count || 0,
    oldMatchDataRemoved: {
      matches: oldMatchIds.length,
      predictions: oldPredictions?.count || 0,
      staleRecentMatches: staleRecent.meta?.changes || 0,
      cutoff: "date('now', '-2 years')",
    },
    cleanedAt: new Date().toISOString(),
  });
}

export async function onRequestPost({ request, env }) {
  return cleanup(request, env);
}

export async function onRequestGet({ request, env }) {
  return cleanup(request, env);
}
