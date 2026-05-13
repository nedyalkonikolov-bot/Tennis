function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asInt(value, fallback = 50) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function onRequestGet({ request, env }) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);

  const url = new URL(request.url);
  const tour = url.searchParams.get("tour") === "WTA" ? "WTA" : "ATP";
  const name = url.searchParams.get("name") || "";
  const limit = Math.max(1, Math.min(asInt(url.searchParams.get("limit"), 100), 200));
  if (!name) return jsonResponse({ ok: false, error: "Missing player name" }, 400);

  const player = await env.TENNIS_DB.prepare("SELECT id, name, tour, current_rank FROM players WHERE tour = ? AND normalized_name = ? LIMIT 1")
    .bind(tour, normalizeName(name))
    .first();

  if (!player?.id) return jsonResponse({ ok: true, player: null, matches: [], form100d: { wins: 0, losses: 0, matches: 0, winRate: 50 } });

  const rows = await env.TENNIS_DB.prepare(`
    SELECT match_date, tournament, surface, opponent_name, opponent_key, score, result, event_status, source_event_id
    FROM player_recent_matches
    WHERE player_id = ?
    ORDER BY match_date DESC
    LIMIT ?
  `).bind(player.id, limit).all();

  const form = await env.TENNIS_DB.prepare(`
    SELECT
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS losses,
      COUNT(*) AS matches
    FROM player_recent_matches
    WHERE player_id = ? AND match_date >= date('now', '-100 days')
  `).bind(player.id).first();

  const wins = Number(form?.wins || 0);
  const losses = Number(form?.losses || 0);
  const total = Number(form?.matches || wins + losses);

  return jsonResponse({
    ok: true,
    player,
    form100d: { wins, losses, matches: total, winRate: total ? Math.round((wins / total) * 1000) / 10 : 50 },
    matches: rows.results || [],
  });
}
