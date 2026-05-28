function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=120" },
  });
}

const MIN_PUBLIC_PICK_ODDS = 1.01;
const MAX_PUBLIC_PICK_ODDS = 2.0;
const MIN_PUBLIC_PICK_CONFIDENCE = 70;

export async function onRequestGet({ request, env }) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
  const status = url.searchParams.get("status");

  const where = `WHERE CAST(COALESCE(p.predicted_odds, '0') AS REAL) BETWEEN ${MIN_PUBLIC_PICK_ODDS} AND ${MAX_PUBLIC_PICK_ODDS}
    AND CAST(COALESCE(p.confidence, 0) AS INTEGER) >= ${MIN_PUBLIC_PICK_CONFIDENCE}
    AND LOWER(COALESCE(m.tournament, '')) NOT LIKE '%doubles%'
    AND COALESCE(m.player_a_name, '') NOT LIKE '%/%'
    AND COALESCE(m.player_b_name, '') NOT LIKE '%/%'${status ? " AND po.result_status = ?" : ""}`;
  const statement = env.TENNIS_DB.prepare(`
    SELECT
      p.id,
      p.created_at,
      p.model_version,
      p.predicted_winner_name,
      p.predicted_side,
      p.confidence,
      p.predicted_odds,
      p.model_edge,
      p.factors_json,
      m.tour,
      m.tournament,
      m.start_time,
      m.status AS match_status,
      m.player_a_name,
      m.player_b_name,
      m.surface,
      m.score,
      po.result_status,
      po.actual_winner_name,
      po.correct,
      po.settled_at
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    LEFT JOIN prediction_outcomes po ON po.prediction_id = p.id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT ?
  `);

  const result = status ? await statement.bind(status, limit).all() : await statement.bind(limit).all();
  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    predictions: (result.results || []).map((row) => ({
      ...row,
      correct: row.correct === null || row.correct === undefined ? null : Boolean(row.correct),
      factors: row.factors_json ? JSON.parse(row.factors_json) : {},
      factors_json: undefined,
    })),
  });
}
