function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=180" },
  });
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "match";
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value) {
  return value === null || value === undefined ? "not enough data" : `${asNumber(value).toFixed(1).replace(/\.0$/, "")}%`;
}

function wl(wins, losses) {
  return `${asNumber(wins)}-${asNumber(losses)}`;
}

function buildAiPrediction(row) {
  const confidence = asNumber(row.confidence, 0);
  const edge = asNumber(row.model_edge, 0);
  const pick = row.predicted_winner_name || "value watch";
  const surface = row.surface || "current surface";
  const aRate = row.player_a_recent_win_rate;
  const bRate = row.player_b_recent_win_rate;
  const aSeasonMatches = asNumber(row.player_a_season_wins) + asNumber(row.player_a_season_losses);
  const bSeasonMatches = asNumber(row.player_b_season_wins) + asNumber(row.player_b_season_losses);
  const aRank = row.player_a_rank ? `#${row.player_a_rank}` : "unranked";
  const bRank = row.player_b_rank ? `#${row.player_b_rank}` : "unranked";
  const strength = confidence >= 78 ? "strong AI lean" : confidence >= 68 ? "positive AI lean" : "measured AI lean";

  const reasons = [
    `${row.player_a_name} is ${aRank} with ${wl(row.player_a_recent_wins, row.player_a_recent_losses)} over the last 100 days (${pct(aRate)}).`,
    `${row.player_b_name} is ${bRank} with ${wl(row.player_b_recent_wins, row.player_b_recent_losses)} over the last 100 days (${pct(bRate)}).`,
    `The 2026 singles season sample is ${aSeasonMatches || 0} matches for ${row.player_a_name} and ${bSeasonMatches || 0} matches for ${row.player_b_name}.`,
    `The model edge is ${edge > 0 ? "+" : ""}${edge.toFixed(1)} with ${surface} listed as the playing surface.`,
  ];

  const summary = `AI pick: ${pick}. This is a ${strength} at ${confidence || "pending"}% confidence, combining Cloudbet price, ranking context, 2026 season record, 100-day form and surface signal.`;
  const bettingAngle = confidence >= 75
    ? `The market and data profile both support ${pick}, but tennis volatility still makes stake sizing important.`
    : `The model sees value on ${pick}, but the edge is moderate and should be treated as research rather than a high-conviction play.`;

  return { summary, reasons, bettingAngle, strength, generatedAt: new Date().toISOString(), model: "TennisTipz AI v2" };
}

export async function onRequestGet({ request, env }) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "100", 10), 1), 500);

  const result = await env.TENNIS_DB.prepare(`
    SELECT
      m.id AS match_id,
      m.tour,
      m.tournament,
      m.start_time,
      m.status,
      m.live,
      m.surface,
      m.player_a_id,
      m.player_b_id,
      m.player_a_name,
      m.player_b_name,
      m.score,
      m.winner_name,
      pa.current_rank AS player_a_rank,
      pb.current_rank AS player_b_rank,
      pa.points AS player_a_points,
      pb.points AS player_b_points,
      COALESCE(ra.recent_matches, 0) AS player_a_recent_matches,
      COALESCE(ra.recent_wins, 0) AS player_a_recent_wins,
      COALESCE(ra.recent_losses, 0) AS player_a_recent_losses,
      CASE WHEN COALESCE(ra.recent_matches, 0) > 0 THEN ROUND((ra.recent_wins * 1000.0 / ra.recent_matches)) / 10.0 ELSE NULL END AS player_a_recent_win_rate,
      COALESCE(rb.recent_matches, 0) AS player_b_recent_matches,
      COALESCE(rb.recent_wins, 0) AS player_b_recent_wins,
      COALESCE(rb.recent_losses, 0) AS player_b_recent_losses,
      CASE WHEN COALESCE(rb.recent_matches, 0) > 0 THEN ROUND((rb.recent_wins * 1000.0 / rb.recent_matches)) / 10.0 ELSE NULL END AS player_b_recent_win_rate,
      COALESCE(sa.matches_won, 0) AS player_a_season_wins,
      COALESCE(sa.matches_lost, 0) AS player_a_season_losses,
      COALESCE(sb.matches_won, 0) AS player_b_season_wins,
      COALESCE(sb.matches_lost, 0) AS player_b_season_losses,
      p.id AS prediction_id,
      p.predicted_winner_name,
      p.predicted_side,
      p.confidence,
      p.predicted_odds,
      p.model_edge,
      p.factors_json,
      po.result_status,
      po.actual_winner_name,
      po.correct,
      po.settled_at
    FROM matches m
    LEFT JOIN players pa ON pa.id = m.player_a_id
    LEFT JOIN players pb ON pb.id = m.player_b_id
    LEFT JOIN (
      SELECT player_id, COUNT(*) AS recent_matches, SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS recent_wins, SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS recent_losses
      FROM player_recent_matches
      WHERE match_date >= date('now', '-100 days')
      GROUP BY player_id
    ) ra ON ra.player_id = m.player_a_id
    LEFT JOIN (
      SELECT player_id, COUNT(*) AS recent_matches, SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS recent_wins, SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS recent_losses
      FROM player_recent_matches
      WHERE match_date >= date('now', '-100 days')
      GROUP BY player_id
    ) rb ON rb.player_id = m.player_b_id
    LEFT JOIN player_season_stats sa ON sa.player_id = m.player_a_id AND sa.type = 'singles' AND sa.season = '2026'
    LEFT JOIN player_season_stats sb ON sb.player_id = m.player_b_id AND sb.type = 'singles' AND sb.season = '2026'
    LEFT JOIN predictions p ON p.match_id = m.id
    LEFT JOIN prediction_outcomes po ON po.prediction_id = p.id
    WHERE m.tour IN ('ATP', 'WTA')
    ORDER BY m.live DESC, p.created_at DESC, m.start_time ASC
    LIMIT ?
  `).bind(limit).all();

  const matches = (result.results || []).map((row) => {
    const title = `${row.player_a_name} vs ${row.player_b_name}`;
    const slug = slugify(`${row.tour} ${title}`);
    const aiPrediction = buildAiPrediction(row);
    return {
      ...row,
      slug,
      title,
      url: `/predictions/${slug}/`,
      correct: row.correct === null || row.correct === undefined ? null : Boolean(row.correct),
      aiPrediction,
      ai_summary: aiPrediction.summary,
      ai_reasons: aiPrediction.reasons,
      ai_betting_angle: aiPrediction.bettingAngle,
    };
  });

  return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), matches });
}
