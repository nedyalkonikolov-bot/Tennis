function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isAuthorized(request, env) {
  const expected = env.DATABASE_SYNC_TOKEN || env.SYNC_TOKEN;
  if (!expected) return false;
  const url = new URL(request.url);
  const token = request.headers.get("x-sync-token") || url.searchParams.get("token");
  return token && token === expected;
}

async function safeAll(statement, fallback = []) {
  try {
    const result = await statement.all();
    return result.results || fallback;
  } catch {
    return fallback;
  }
}

async function report(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  const db = env.TENNIS_DB;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "25", 10), 1), 100);

  const latestRun = await db.prepare(`
    SELECT *
    FROM gsc_sync_runs
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `).first().catch(() => null);

  const opportunities = await safeAll(db.prepare(`
    SELECT sync_date, type, priority, page, query, title, recommendation, metrics_json, openai_json, status, created_at
    FROM gsc_seo_opportunities
    ORDER BY
      CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      datetime(created_at) DESC
    LIMIT ?
  `).bind(limit));

  const topQueries = await safeAll(db.prepare(`
    SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impressions, AVG(ctr) AS ctr, AVG(position) AS position
    FROM gsc_search_analytics
    WHERE query IS NOT NULL AND query <> ''
    GROUP BY query
    ORDER BY impressions DESC
    LIMIT 20
  `));

  const topPages = await safeAll(db.prepare(`
    SELECT page, SUM(clicks) AS clicks, SUM(impressions) AS impressions, AVG(ctr) AS ctr, AVG(position) AS position
    FROM gsc_search_analytics
    WHERE page IS NOT NULL AND page <> ''
    GROUP BY page
    ORDER BY impressions DESC
    LIMIT 20
  `));

  const inspections = await safeAll(db.prepare(`
    SELECT sync_date, url, verdict, coverage_state, indexing_state, robots_txt_state, page_fetch_state, google_canonical, user_canonical, created_at
    FROM gsc_url_inspections
    ORDER BY datetime(created_at) DESC
    LIMIT 20
  `));

  return jsonResponse({
    ok: true,
    latestRun,
    summary: {
      opportunities: opportunities.length,
      critical: opportunities.filter((item) => item.priority === "critical").length,
      high: opportunities.filter((item) => item.priority === "high").length,
      queries: topQueries.length,
      pages: topPages.length,
      inspections: inspections.length,
    },
    opportunities: opportunities.map((item) => ({
      ...item,
      metrics: JSON.parse(item.metrics_json || "{}"),
      openAi: JSON.parse(item.openai_json || "{}"),
      metrics_json: undefined,
      openai_json: undefined,
    })),
    topQueries,
    topPages,
    inspections,
  });
}

export async function onRequestGet({ request, env }) {
  return report(request, env);
}
