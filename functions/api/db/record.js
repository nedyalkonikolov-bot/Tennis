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

async function bettingRow(db, where = "", bindings = []) {
  const row = await db.prepare(`
    SELECT
      COUNT(*) AS bets,
      SUM(CASE WHEN po.correct = 1 THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN po.correct = 1 THEN CAST(COALESCE(p.predicted_odds, '0') AS REAL) ELSE 0 END) AS returns
    FROM prediction_outcomes po
    JOIN predictions p ON p.id = po.prediction_id
    JOIN matches m ON m.id = po.match_id
    WHERE po.result_status = 'settled'
      AND CAST(COALESCE(p.predicted_odds, '0') AS REAL) > 0
    ${where}
  `).bind(...bindings).first();

  const bets = row?.bets || 0;
  const wins = row?.wins || 0;
  const returns = row?.returns || 0;
  const profit = returns - bets;
  return {
    stakePerPick: 1,
    bets,
    wins,
    losses: bets - wins,
    totalStake: Math.round(bets * 100) / 100,
    totalReturn: Math.round(returns * 100) / 100,
    netProfit: Math.round(profit * 100) / 100,
    roiPercent: bets ? Math.round((profit / bets) * 10000) / 100 : null,
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
  const [bettingAll, bettingPublicPicks] = await Promise.all([
    bettingRow(db),
    bettingRow(
      db,
      `AND CAST(COALESCE(p.predicted_odds, '0') AS REAL) BETWEEN 1.01 AND 2.0
       AND CAST(COALESCE(p.confidence, 0) AS INTEGER) >= 70
       AND LOWER(COALESCE(m.tournament, '')) NOT LIKE '%doubles%'
       AND COALESCE(m.player_a_name, '') NOT LIKE '%/%'
       AND COALESCE(m.player_b_name, '') NOT LIKE '%/%'`
    ),
  ]);

  const strategyBacktest = await db.prepare(`
    SELECT
      m.tour,
      LOWER(COALESCE(m.surface, 'unknown')) AS surface,
      CASE
        WHEN CAST(p.predicted_odds AS REAL) < 1.20 THEN '1.01-1.19'
        WHEN CAST(p.predicted_odds AS REAL) < 1.40 THEN '1.20-1.39'
        WHEN CAST(p.predicted_odds AS REAL) < 1.60 THEN '1.40-1.59'
        WHEN CAST(p.predicted_odds AS REAL) < 1.80 THEN '1.60-1.79'
        WHEN CAST(p.predicted_odds AS REAL) <= 2.00 THEN '1.80-2.00'
        ELSE 'outside'
      END AS odds_band,
      CASE
        WHEN p.confidence < 70 THEN 'under-70'
        WHEN p.confidence < 75 THEN '70-74'
        WHEN p.confidence < 80 THEN '75-79'
        ELSE '80-plus'
      END AS confidence_band,
      COUNT(*) AS bets,
      SUM(CASE WHEN po.correct = 1 THEN 1 ELSE 0 END) AS wins,
      ROUND(SUM(CASE WHEN po.correct = 1 THEN CAST(p.predicted_odds AS REAL) ELSE 0 END), 2) AS total_return
    FROM prediction_outcomes po
    JOIN predictions p ON p.id = po.prediction_id
    JOIN matches m ON m.id = po.match_id
    WHERE po.result_status = 'settled'
      AND CAST(COALESCE(p.predicted_odds, '0') AS REAL) BETWEEN 1.01 AND 2.00
      AND LOWER(COALESCE(m.tournament, '')) NOT LIKE '%doubles%'
      AND COALESCE(m.player_a_name, '') NOT LIKE '%/%'
      AND COALESCE(m.player_b_name, '') NOT LIKE '%/%'
    GROUP BY m.tour, LOWER(COALESCE(m.surface, 'unknown')), odds_band, confidence_band
    ORDER BY bets DESC
  `).all();

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
      betting: {
        allSettledPredictions: bettingAll,
        publicPickFilter: bettingPublicPicks,
      },
      strategyBacktest: (strategyBacktest.results || []).map((row) => {
        const bets = Number(row.bets || 0);
        const wins = Number(row.wins || 0);
        const totalReturn = Number(row.total_return || 0);
        return {
          ...row,
          bets,
          wins,
          losses: bets - wins,
          hitRate: bets ? Math.round((wins / bets) * 1000) / 10 : null,
          netProfit: Math.round((totalReturn - bets) * 100) / 100,
          roiPercent: bets ? Math.round(((totalReturn - bets) / bets) * 10000) / 100 : null,
        };
      }),
    },
    recent: (recent.results || []).map((row) => ({
      ...row,
      correct: row.correct === null || row.correct === undefined ? null : Boolean(row.correct),
    })),
  });
}
