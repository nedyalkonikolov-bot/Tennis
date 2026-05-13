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

  const before = await env.TENNIS_DB.prepare("SELECT COUNT(*) AS count FROM player_recent_matches WHERE source <> 'api-tennis-fixtures'").first();
  await env.TENNIS_DB.prepare("DELETE FROM player_recent_matches WHERE source <> 'api-tennis-fixtures'").run();
  const after = await env.TENNIS_DB.prepare("SELECT COUNT(*) AS count FROM player_recent_matches").first();

  return jsonResponse({ ok: true, removed: before?.count || 0, remaining: after?.count || 0, cleanedAt: new Date().toISOString() });
}

export async function onRequestPost({ request, env }) {
  return cleanup(request, env);
}

export async function onRequestGet({ request, env }) {
  return cleanup(request, env);
}
