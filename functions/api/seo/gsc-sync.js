const SITE_URL = "https://www.tennistipz.win";
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEARCH_ANALYTICS_URL = "https://www.googleapis.com/webmasters/v3/sites";
const URL_INSPECTION_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

const PRIORITY_URLS = [
  `${SITE_URL}/`,
  `${SITE_URL}/sitemap.xml`,
  `${SITE_URL}/wimbledon/`,
  `${SITE_URL}/wimbledon-predictions-today/`,
  `${SITE_URL}/wimbledon-day-3-betting-preview/`,
  `${SITE_URL}/best-wimbledon-underdog-picks/`,
  `${SITE_URL}/atp-wimbledon-predictions/`,
  `${SITE_URL}/wta-wimbledon-predictions/`,
  `${SITE_URL}/tennis-predictions-today/`,
  `${SITE_URL}/tennis-predictions/`,
];

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

function base64Url(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem) {
  const clean = String(pem || "")
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function signJwt(env) {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL || env.GSC_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({ iss: email, scope: GSC_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

async function getGoogleAccessToken(env) {
  const directToken = env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN || env.GSC_ACCESS_TOKEN;
  if (directToken) return { token: directToken, source: "access-token" };
  const assertion = await signJwt(env);
  if (!assertion) return null;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) return { error: true, status: response.status, payload };
  return { token: payload.access_token, source: "service-account" };
}

function daysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function slugify(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "seo-opportunity";
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function ensureTables(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS gsc_search_analytics (
        id TEXT PRIMARY KEY,
        sync_date TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        query TEXT,
        page TEXT,
        country TEXT,
        device TEXT,
        clicks INTEGER NOT NULL DEFAULT 0,
        impressions INTEGER NOT NULL DEFAULT 0,
        ctr REAL NOT NULL DEFAULT 0,
        position REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(sync_date, start_date, end_date, query, page, country, device)
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gsc_search_sync ON gsc_search_analytics(sync_date DESC, impressions DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gsc_search_page ON gsc_search_analytics(page, sync_date DESC)"),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS gsc_url_inspections (
        id TEXT PRIMARY KEY,
        sync_date TEXT NOT NULL,
        url TEXT NOT NULL,
        verdict TEXT,
        coverage_state TEXT,
        indexing_state TEXT,
        robots_txt_state TEXT,
        page_fetch_state TEXT,
        google_canonical TEXT,
        user_canonical TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(sync_date, url)
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gsc_inspections_url ON gsc_url_inspections(url, sync_date DESC)"),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS gsc_seo_opportunities (
        id TEXT PRIMARY KEY,
        sync_date TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        page TEXT,
        query TEXT,
        title TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        openai_json TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(sync_date, type, page, query, title)
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gsc_opportunities_date ON gsc_seo_opportunities(sync_date DESC, priority)"),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS gsc_sync_runs (
        id TEXT PRIMARY KEY,
        sync_date TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        rows_imported INTEGER NOT NULL DEFAULT 0,
        inspections_checked INTEGER NOT NULL DEFAULT 0,
        opportunities_created INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        status TEXT NOT NULL,
        errors_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gsc_sync_runs_date ON gsc_sync_runs(sync_date DESC)"),
  ]);
}

async function fetchSearchAnalytics(token, siteUrl, startDate, endDate, rowLimit) {
  const response = await fetch(`${SEARCH_ANALYTICS_URL}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ["query", "page", "country", "device"],
      rowLimit,
      startRow: 0,
      dataState: "final",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Search Analytics ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.rows || [];
}

async function inspectUrl(token, siteUrl, inspectionUrl) {
  const response = await fetch(URL_INSPECTION_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ inspectionUrl, siteUrl }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { url: inspectionUrl, ok: false, status: response.status, payload };
  return { url: inspectionUrl, ok: true, payload };
}

async function storeRows(db, syncDate, startDate, endDate, rows) {
  let imported = 0;
  for (const row of rows) {
    const [query = "", page = "", country = "", device = ""] = row.keys || [];
    await db.prepare(`
      INSERT OR REPLACE INTO gsc_search_analytics
        (id, sync_date, start_date, end_date, query, page, country, device, clicks, impressions, ctr, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `${syncDate}:${slugify(query)}:${slugify(page)}:${country}:${device}`.slice(0, 220),
      syncDate,
      startDate,
      endDate,
      query,
      page,
      country,
      device,
      Math.round(asNumber(row.clicks)),
      Math.round(asNumber(row.impressions)),
      asNumber(row.ctr),
      asNumber(row.position)
    ).run();
    imported += 1;
  }
  return imported;
}

async function storeInspections(db, syncDate, inspections) {
  let checked = 0;
  for (const item of inspections) {
    const indexStatus = item.payload?.inspectionResult?.indexStatusResult || {};
    await db.prepare(`
      INSERT OR REPLACE INTO gsc_url_inspections
        (id, sync_date, url, verdict, coverage_state, indexing_state, robots_txt_state, page_fetch_state, google_canonical, user_canonical, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `${syncDate}:${item.url}`,
      syncDate,
      item.url,
      indexStatus.verdict || (item.ok ? "UNKNOWN" : "ERROR"),
      indexStatus.coverageState || "",
      indexStatus.indexingState || "",
      indexStatus.robotsTxtState || "",
      indexStatus.pageFetchState || "",
      indexStatus.googleCanonical || "",
      indexStatus.userCanonical || "",
      JSON.stringify(item.payload || {})
    ).run();
    checked += 1;
  }
  return checked;
}

function deterministicOpportunities(rows, inspections) {
  const opportunities = [];
  const byPage = new Map();
  for (const row of rows) {
    const [query = "", page = "", country = "", device = ""] = row.keys || [];
    const clicks = asNumber(row.clicks);
    const impressions = asNumber(row.impressions);
    const ctr = asNumber(row.ctr);
    const position = asNumber(row.position);
    const normalized = { query, page, country, device, clicks, impressions, ctr, position };
    if (impressions >= 20 && position >= 5 && position <= 30) {
      opportunities.push({
        type: "ranking-opportunity",
        priority: position <= 15 ? "high" : "medium",
        page,
        query,
        title: `Move "${query}" from position ${position.toFixed(1)}`,
        recommendation: `Improve the page around "${query}" with a stronger intro, internal links from Wimbledon/prediction hubs, updated match context, and a clearer title/meta angle.`,
        metrics: normalized,
      });
    }
    if (impressions >= 30 && ctr < 0.015) {
      opportunities.push({
        type: "ctr-opportunity",
        priority: "high",
        page,
        query,
        title: `Low CTR for "${query}"`,
        recommendation: `Rewrite the title/meta description to make the page more specific to "${query}" and include a live/today/Wimbledon value proposition where accurate.`,
        metrics: normalized,
      });
    }
    const pageStats = byPage.get(page) || { page, clicks: 0, impressions: 0, queries: new Set() };
    pageStats.clicks += clicks;
    pageStats.impressions += impressions;
    if (query) pageStats.queries.add(query);
    byPage.set(page, pageStats);
  }
  for (const pageStats of byPage.values()) {
    if (pageStats.impressions >= 50 && pageStats.clicks <= 1) {
      opportunities.push({
        type: "page-refresh",
        priority: "medium",
        page: pageStats.page,
        query: [...pageStats.queries].slice(0, 3).join(", "),
        title: `Refresh page with ${pageStats.impressions} impressions`,
        recommendation: "Add fresher data, a stronger above-the-fold answer, internal links to related prediction/player pages, and a more compelling SERP snippet.",
        metrics: { clicks: pageStats.clicks, impressions: pageStats.impressions, topQueries: [...pageStats.queries].slice(0, 8) },
      });
    }
  }
  for (const inspection of inspections) {
    const status = inspection.payload?.inspectionResult?.indexStatusResult || {};
    if (!inspection.ok || (status.verdict && status.verdict !== "PASS")) {
      opportunities.push({
        type: "indexing-issue",
        priority: "critical",
        page: inspection.url,
        query: "",
        title: `Indexing issue: ${inspection.url}`,
        recommendation: `Review coverage state "${status.coverageState || "unknown"}", canonical "${status.googleCanonical || "unknown"}", and page fetch state "${status.pageFetchState || "unknown"}".`,
        metrics: { ok: inspection.ok, verdict: status.verdict || "ERROR", coverageState: status.coverageState || "", pageFetchState: status.pageFetchState || "" },
      });
    }
  }
  return opportunities
    .filter((item, index, list) => list.findIndex((candidate) => candidate.type === item.type && candidate.page === item.page && candidate.query === item.query) === index)
    .slice(0, 40);
}

async function callOpenAiOpportunities(env, rows, deterministic, inspections) {
  if (!env.OPENAI_API_KEY) return { source: "deterministic", opportunities: deterministic, reason: "missing-openai" };
  const compactRows = rows.slice(0, 80).map((row) => {
    const [query = "", page = "", country = "", device = ""] = row.keys || [];
    return { query, page, country, device, clicks: row.clicks || 0, impressions: row.impressions || 0, ctr: row.ctr || 0, position: row.position || 0 };
  });
  const compactInspections = inspections.map((item) => ({
    url: item.url,
    ok: item.ok,
    verdict: item.payload?.inspectionResult?.indexStatusResult?.verdict || "",
    coverageState: item.payload?.inspectionResult?.indexStatusResult?.coverageState || "",
  }));
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_SEO_MODEL || env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: "You are an SEO strategist for TennisTipz.win. Use only supplied Google Search Console data. Return strict JSON only with opportunities. Do not invent traffic, rankings, or facts. Focus on actions that can increase organic search traffic for tennis predictions, Wimbledon, crypto tennis betting, Brazil, Bangladesh and Turkey pages.",
        },
        {
          role: "user",
          content: JSON.stringify({
            requiredSchema: { opportunities: [{ type: "ranking-opportunity|ctr-opportunity|content-brief|internal-link|indexing-issue", priority: "critical|high|medium|low", page: "url", query: "search query or empty", title: "short title", recommendation: "specific action", suggestedTitle: "optional SEO title", suggestedMetaDescription: "optional meta description", internalLinks: ["urls"], contentBrief: ["bullets"] }] },
            searchAnalyticsRows: compactRows,
            deterministicOpportunities: deterministic.slice(0, 20),
            urlInspections: compactInspections,
          }),
        },
      ],
      text: { format: { type: "text" } },
      max_output_tokens: 1600,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { source: "deterministic", opportunities: deterministic, reason: `openai-${response.status}`, payload };
  const raw = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((part) => part.text).filter(Boolean).join("\n") || "";
  try {
    const parsed = JSON.parse(raw);
    const opportunities = Array.isArray(parsed.opportunities) && parsed.opportunities.length ? parsed.opportunities : deterministic;
    return { source: "openai", model: env.OPENAI_SEO_MODEL || env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL, opportunities, raw: parsed };
  } catch (error) {
    return { source: "deterministic", opportunities: deterministic, reason: `openai-json-${error.message}`, raw: raw.slice(0, 500) };
  }
}

async function storeOpportunities(db, syncDate, opportunities, openAiMeta) {
  let created = 0;
  for (const item of opportunities.slice(0, 50)) {
    const title = String(item.title || item.recommendation || "SEO opportunity").slice(0, 220);
    await db.prepare(`
      INSERT OR REPLACE INTO gsc_seo_opportunities
        (id, sync_date, type, priority, page, query, title, recommendation, metrics_json, openai_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `).bind(
      `${syncDate}:${slugify(item.type)}:${slugify(item.page)}:${slugify(item.query)}:${slugify(title)}`.slice(0, 240),
      syncDate,
      item.type || "seo-opportunity",
      item.priority || "medium",
      item.page || "",
      item.query || "",
      title,
      String(item.recommendation || "Review this SEO opportunity.").slice(0, 1200),
      JSON.stringify(item.metrics || {}),
      JSON.stringify({ ...item, openAiSource: openAiMeta.source, model: openAiMeta.model || null })
    ).run();
    created += 1;
  }
  return created;
}

async function sync(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  const db = env.TENNIS_DB;
  await ensureTables(db);
  const url = new URL(request.url);
  const syncDate = new Date().toISOString().slice(0, 10);
  const startDate = url.searchParams.get("startDate") || daysAgo(Number.parseInt(env.GSC_SYNC_LOOKBACK_DAYS || "10", 10));
  const endDate = url.searchParams.get("endDate") || daysAgo(Number.parseInt(env.GSC_SYNC_DELAY_DAYS || "2", 10));
  const rowLimit = Math.min(Math.max(Number.parseInt(url.searchParams.get("rowLimit") || env.GSC_SYNC_ROW_LIMIT || "250", 10), 10), 25000);
  const siteUrl = env.GSC_SITE_URL || `${SITE_URL}/`;
  const errors = [];
  const tokenResult = await getGoogleAccessToken(env);
  if (!tokenResult) return jsonResponse({ ok: false, error: "Missing Google Search Console credentials" }, 500);
  if (tokenResult.error) return jsonResponse({ ok: false, error: "Google token failed", tokenResult }, 500);

  let rows = [];
  let inspections = [];
  try {
    rows = await fetchSearchAnalytics(tokenResult.token, siteUrl, startDate, endDate, rowLimit);
  } catch (error) {
    errors.push(error.message);
  }
  const inspectionUrls = (url.searchParams.get("inspectUrls") || "").split(",").map((item) => item.trim()).filter(Boolean);
  const urlsToInspect = (inspectionUrls.length ? inspectionUrls : PRIORITY_URLS).slice(0, Number.parseInt(env.GSC_INSPECTION_LIMIT || "10", 10));
  inspections = await Promise.all(urlsToInspect.map((targetUrl) => inspectUrl(tokenResult.token, siteUrl, targetUrl).catch((error) => ({ url: targetUrl, ok: false, payload: { error: error.message } }))));

  const rowsImported = await storeRows(db, syncDate, startDate, endDate, rows);
  const inspectionsChecked = await storeInspections(db, syncDate, inspections);
  const deterministic = deterministicOpportunities(rows, inspections);
  const openAi = await callOpenAiOpportunities(env, rows, deterministic, inspections);
  const opportunitiesCreated = await storeOpportunities(db, syncDate, openAi.opportunities, openAi);

  await db.prepare(`
    INSERT INTO gsc_sync_runs (id, sync_date, start_date, end_date, rows_imported, inspections_checked, opportunities_created, model, status, errors_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), syncDate, startDate, endDate, rowsImported, inspectionsChecked, opportunitiesCreated, openAi.model || null, errors.length ? "partial" : "ok", JSON.stringify(errors)).run();

  return jsonResponse({
    ok: errors.length === 0,
    auth: tokenResult.source,
    siteUrl,
    syncDate,
    startDate,
    endDate,
    rowsImported,
    inspectionsChecked,
    opportunitiesCreated,
    openAiSource: openAi.source,
    model: openAi.model || null,
    topOpportunities: openAi.opportunities.slice(0, 10),
    errors,
  });
}

export async function onRequestPost({ request, env }) {
  return sync(request, env);
}

export async function onRequestGet({ request, env }) {
  return sync(request, env);
}
