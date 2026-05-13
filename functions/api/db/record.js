function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

async function accuracyRow(db, where = "", bindings = []) {
  const row = await db.prepare(`
    SELECT
      COUNT(*) AS settled,
      SUM(CASE WHEN po.correct = 1 THEN 1 ELSE 0 END) AS correct,
      AVG(p.confidence) AS average_confidence
    FROM prediction_outcomes po
    JOIN predictions p ON p.id = po.prediction_id
    JOIN matches m ON m.id = po.match_id
    WHERE po.result_status = 'settled'
    ${where}
  `).bind(...bindings).first();

  const settled = row?.settled || 0;
  const correct = row?.correct || 0;
  return {
    settled,
    correct,
    percent: settled ? Math.round((correct / settled) * 1000) / 10 : null,
    averageConfidence: row?.average_confidence ? Math.round(row.average_confidence * 10) / 10 : null,
  };
}

export async function onRequestGet({ env }) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  const db = env.TENNIS_DB;

  const [overall, atp, wta, last30, clay, hard, grass] = await Promise.all([
    accuracyRow(db),
    accuracyRow(db, "AND m.tour = ?", ["ATP"]),
    accuracyRow(db, "AND m.tour = ?", ["WTA"]),
    accuracyRow(db, "AND po.settled_at >= datetime('now', '-30 days')"),
    accuracyRow(db, "AND LOWER(COALESCE(m.surface, '')) = ?", ["clay"]),
    accuracyRow(db, "AND LOWER(COALESCE(m.surface, '')) = ?", ["hard"]),
    accuracyRow(db, "AND LOWER(COALESCE(m.surface, '')) = ?", ["grass"]),
  ]);

  const recent = await db.prepare(`
    SELECT
      p.id,
      p.predicted_winner_name,
      p.confidence,
      p.predicted_odds,
      m.tour,
      m.tournament,
      m.start_time,
      m.player_a_name,
      m.player_b_name,
      m.surface,
      m.score,
      po.actual_winner_name,
      po.correct,
      po.settled_at
    FROM prediction_outcomes po
    JOIN predictions p ON p.id = po.prediction_id
    JOIN matches m ON m.id = po.match_id
    WHERE po.result_status = 'settled'
    ORDER BY po.settled_at DESC
    LIMIT 50
  `).all();

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    record: {
      overall,
      tours: { ATP: atp, WTA: wta },
      last30,
      surfaces: { clay, hard, grass },
    },
    recent: (recent.results || []).map((row) => ({
      ...row,
      correct: row.correct === null || row.correct === undefined ? null : Boolean(row.correct),
    })),
  });
}
