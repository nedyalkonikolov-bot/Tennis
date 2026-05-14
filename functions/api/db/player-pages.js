function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=600" },
  });
}

const SEASON_STATS_YEAR = "2026";

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
      p.player_bday,
      p.player_logo,
      p.updated_at,
      COALESCE(r.recent_matches, 0) AS recent_matches,
      COALESCE(r.recent_wins, 0) AS recent_wins,
      COALESCE(r.recent_losses, 0) AS recent_losses,
      CASE WHEN COALESCE(r.recent_matches, 0) > 0 THEN ROUND((r.recent_wins * 1000.0 / r.recent_matches)) / 10.0 ELSE NULL END AS recent_win_rate,
      s.season AS season,
      s.season_rank,
      s.titles,
      s.matches_won,
      s.matches_lost,
      s.hard_won,
      s.hard_lost,
      s.clay_won,
      s.clay_lost,
      s.grass_won,
      s.grass_lost,
      COALESCE(r.recent_matches, 0) AS stored_matches,
      COALESCE(r.recent_wins, 0) AS stored_wins,
      (SELECT COUNT(*) FROM predictions pr JOIN matches m ON m.id = pr.match_id WHERE m.player_a_id = p.id OR m.player_b_id = p.id) AS prediction_mentions
    FROM players p
    LEFT JOIN (
      SELECT
        player_id,
        COUNT(*) AS recent_matches,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS recent_wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS recent_losses
      FROM player_recent_matches
      WHERE match_date >= date('now', '-100 days') AND source = 'api-tennis-fixtures'
      GROUP BY player_id
    ) r ON r.player_id = p.id
    LEFT JOIN player_season_stats s ON s.player_id = p.id AND s.type = 'singles' AND s.season = ?
    ${where}
    ORDER BY p.tour ASC, COALESCE(p.current_rank, 999999) ASC, p.name ASC
    LIMIT ?
  `).bind(SEASON_STATS_YEAR, ...bindings, limit).all();

  const players = (result.results || []).map((row) => ({
    ...row,
    slug: slugify(row.name),
    url: `/players/${String(row.tour || "atp").toLowerCase()}/${slugify(row.name)}/`,
  }));

  return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), statSource: "API-Tennis standings, 2026 get_players season stats, and 100-day fixture results", seasonStatsYear: SEASON_STATS_YEAR, players });
}
