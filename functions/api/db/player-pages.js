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
    WITH recent AS (
      SELECT
        canonical.id AS player_id,
        COUNT(DISTINCT rm.id) AS recent_matches,
        SUM(CASE WHEN rm.result = 'win' THEN 1 ELSE 0 END) AS recent_wins,
        SUM(CASE WHEN rm.result = 'loss' THEN 1 ELSE 0 END) AS recent_losses,
        MAX(rm.match_date) AS latest_recent_match_date
      FROM players canonical
      JOIN player_recent_matches rm ON
        rm.player_id = canonical.id
        OR (
          rm.player_key IS NOT NULL AND rm.player_key != ''
          AND canonical.player_key = rm.player_key
          AND canonical.tour = rm.tour
        )
      WHERE rm.match_date >= date('now', '-100 days')
        AND rm.source LIKE 'api-tennis%'
      GROUP BY canonical.id
    ), season AS (
      SELECT
        canonical.id AS canonical_player_id,
        ss.*,
        ROW_NUMBER() OVER (
          PARTITION BY canonical.id
          ORDER BY CASE WHEN ss.player_id = canonical.id THEN 0 ELSE 1 END, datetime(ss.updated_at) DESC
        ) AS row_number
      FROM players canonical
      JOIN player_season_stats ss ON
        ss.player_id = canonical.id
        OR (
          ss.player_key IS NOT NULL AND ss.player_key != ''
          AND canonical.player_key = ss.player_key
          AND canonical.tour = ss.tour
        )
      WHERE ss.season = ? AND LOWER(ss.type) = 'singles'
    )
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
      r.latest_recent_match_date,
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
    LEFT JOIN recent r ON r.player_id = p.id
    LEFT JOIN season s ON s.canonical_player_id = p.id AND s.row_number = 1
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
