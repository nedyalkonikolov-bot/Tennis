function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=600" },
  });
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "player";
}

export async function onRequestGet({ request, env }) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  const url = new URL(request.url);
  const tour = url.searchParams.get("tour");
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "500", 10), 1), 500);
  const conditions = [];
  const bindings = [];

  if (tour === "ATP" || tour === "WTA") {
    conditions.push("p.tour = ?");
    bindings.push(tour);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await env.TENNIS_DB.prepare(`
    SELECT
      p.id,
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
      p.updated_at,
      (SELECT COUNT(*) FROM matches m WHERE m.player_a_id = p.id OR m.player_b_id = p.id) AS stored_matches,
      (SELECT COUNT(*) FROM matches m WHERE m.winner_player_id = p.id) AS stored_wins,
      (SELECT COUNT(*) FROM predictions pr JOIN matches m ON m.id = pr.match_id WHERE m.player_a_id = p.id OR m.player_b_id = p.id) AS prediction_mentions
    FROM players p
    ${where}
    ORDER BY p.tour ASC, COALESCE(p.current_rank, 999999) ASC, p.name ASC
    LIMIT ?
  `).bind(...bindings, limit).all();

  const players = (result.results || []).map((row) => ({
    ...row,
    slug: slugify(row.name),
    url: `/players/${String(row.tour || "atp").toLowerCase()}/${slugify(row.name)}/`,
  }));

  return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), players });
}
