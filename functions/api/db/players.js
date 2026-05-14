function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

const SEASON_STATS_YEAR = "2026";

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
      p.player_bday,
      p.player_logo,
      p.source,
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
      CASE WHEN COALESCE(r.recent_matches, 0) > 0 THEN ROUND((r.recent_wins * 1000.0 / r.recent_matches)) / 10.0 ELSE NULL END AS form_rating,
      COALESCE(r.recent_matches, 0) AS stored_matches,
      COALESCE(r.recent_wins, 0) AS stored_wins,
      (SELECT COUNT(*) FROM player_stat_snapshots ps WHERE ps.player_id = p.id) AS snapshots
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
  `);

  const result = await statement.bind(SEASON_STATS_YEAR, ...bindings, limit).all();
  return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), statSource: "API-Tennis standings, 2026 get_players season stats, and 100-day fixture results", seasonStatsYear: SEASON_STATS_YEAR, players: result.results || [] });
}
