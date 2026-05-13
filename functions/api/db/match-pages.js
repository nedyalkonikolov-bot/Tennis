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
      m.player_a_name,
      m.player_b_name,
      m.score,
      m.winner_name,
      p.id AS prediction_id,
      p.predicted_winner_name,
      p.predicted_side,
      p.confidence,
      p.predicted_odds,
      p.model_edge,
      po.result_status,
      po.actual_winner_name,
      po.correct,
      po.settled_at
    FROM matches m
    LEFT JOIN predictions p ON p.match_id = m.id
    LEFT JOIN prediction_outcomes po ON po.prediction_id = p.id
    ORDER BY m.live DESC, p.created_at DESC, m.start_time ASC
    LIMIT ?
  `).bind(limit).all();

  const matches = (result.results || []).map((row) => {
    const title = `${row.player_a_name} vs ${row.player_b_name}`;
    return {
      ...row,
      slug: slugify(`${row.tour} ${title}`),
      title,
      url: `/predictions/${slugify(`${row.tour} ${title}`)}/`,
      correct: row.correct === null || row.correct === undefined ? null : Boolean(row.correct),
    };
  });

  return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), matches });
}
