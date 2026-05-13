function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  const url = new URL(request.url);
  const tour = url.searchParams.get("tour");
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "100", 10), 1), 500);
  const query = (url.searchParams.get("q") || "").trim().toLowerCase();

  const conditions = [];
  const bindings = [];
  if (tour === "ATP" || tour === "WTA") {
    conditions.push("p.tour = ?");
    bindings.push(tour);
  }
  if (query) {
    conditions.push("(LOWER(p.name) LIKE ? OR LOWER(COALESCE(p.country, '')) LIKE ?)");
    bindings.push(`%${query}%`, `%${query}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const statement = env.TENNIS_DB.prepare(`
    SELECT
      p.id,
      p.player_key,
      p.name,
      p.tour,
      p.country,
      p.current_rank,
      p.points,
      p.movement,
      p.form_rating,
      p.hold_rate,
      p.break_rate,
      p.clay_rating,
      p.hard_rating,
      p.grass_rating,
      p.source,
      p.updated_at,
      (
        SELECT COUNT(*)
        FROM matches m
        WHERE m.player_a_id = p.id OR m.player_b_id = p.id
      ) AS stored_matches,
      (
        SELECT COUNT(*)
        FROM matches m
        WHERE m.winner_player_id = p.id
      ) AS stored_wins,
      (
        SELECT COUNT(*)
        FROM player_stat_snapshots s
        WHERE s.player_id = p.id
      ) AS snapshots
    FROM players p
    ${where}
    ORDER BY p.tour ASC, COALESCE(p.current_rank, 999999) ASC, p.name ASC
    LIMIT ?
  `);

  const result = await statement.bind(...bindings, limit).all();
  return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), players: result.results || [] });
}
