const DEFAULT_SITE_ORIGIN = "https://tennistipz.win";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function siteOrigin(env) {
  return String(env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/$/, "");
}

async function callSite(env, path, options = {}) {
  const url = siteOrigin(env) + path;
  const headers = new Headers(options.headers || {});
  headers.set("accept", "application/json");
  if (options.authenticated) {
    if (!env.SYNC_TOKEN) throw new Error("SYNC_TOKEN is missing");
    headers.set("x-sync-token", env.SYNC_TOKEN);
  }
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { text: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${text.slice(0, 300)}`);
  return { ok: true, url, status: response.status, payload };
}

async function refreshPredictions(env) {
  const result = await callSite(env, "/api/live-data?refresh=1");
  return {
    task: "refresh-predictions",
    matches: result.payload?.matches?.length || 0,
    dbSync: result.payload?.diagnostics?.dbPredictionSync || null,
    dbUpserted: result.payload?.diagnostics?.dbPredictionsUpserted || 0,
  };
}

async function syncDatabase(env) {
  const result = await callSite(env, "/api/db/sync", { method: "POST", authenticated: true });
  return {
    task: "db-sync",
    ok: result.payload?.ok === true,
    matchesUpserted: result.payload?.matchesUpserted || 0,
    predictionsUpserted: result.payload?.predictionsUpserted || 0,
    outcomesSettled: result.payload?.outcomesSettled || 0,
    recentMatchesUpserted: result.payload?.recentMatchesUpserted || 0,
  };
}

async function postThreadsPrediction(env, language = "en", style = "mixed") {
  const result = await callSite(env, "/api/automation/promote?platform=threads&mode=human&limit=1", { method: "POST", authenticated: true });
  return {
    task: "threads-authentic-autopost",
    language,
    style,
    ok: result.payload?.ok === true,
    mode: result.payload?.mode || null,
    source: result.payload?.source || null,
    posted: result.payload?.publishResult?.ok === true ? 1 : 0,
    skipped: Boolean(result.payload?.publishResult?.skipped || result.payload?.skipped),
    selectedType: result.payload?.selectedType || null,
    rules: result.payload?.rules || null,
  };
}

async function syncOutcomes(env, days = 180, limit = 20) {
  const result = await callSite(env, `/api/db/sync-outcomes?days=${encodeURIComponent(days)}&limit=${encodeURIComponent(limit)}`, { method: "POST", authenticated: true });
  return {
    task: "sync-outcomes",
    ok: result.payload?.ok === true,
    checked: result.payload?.checked || 0,
    settled: result.payload?.settled || 0,
    correct: result.payload?.correct || 0,
    missed: result.payload?.missed?.length || 0,
  };
}

async function postHumanThreads(env) {
  const result = await callSite(env, "/api/automation/promote?platform=threads&mode=human&limit=1", { method: "POST", authenticated: true });
  return {
    task: "threads-human-autopost",
    ok: result.payload?.ok === true,
    source: result.payload?.source || null,
    posted: result.payload?.publishResult?.ok === true ? 1 : 0,
    skipped: Boolean(result.payload?.publishResult?.skipped || result.payload?.skipped),
    selectedType: result.payload?.selectedType || null,
    rules: result.payload?.rules || null,
  };
}

async function generateSeoArticle(env) {
  const result = await callSite(env, "/api/automation/articles", { method: "POST", authenticated: true });
  return {
    task: "content-autopublish",
    ok: result.payload?.ok === true,
    enabled: result.payload?.enabled !== false,
    requested: result.payload?.requested || null,
    published: result.payload?.published?.length || 0,
    skippedDuplicates: result.payload?.skippedDuplicates?.length || 0,
    failedGenerations: result.payload?.failedGenerations?.length || 0,
    model: result.payload?.model || null,
    articles: (result.payload?.published || []).map((item) => item.url).filter(Boolean),
  };
}

async function cleanupRecentMatches(env) {
  const result = await callSite(env, "/api/db/cleanup-recent", { method: "POST", authenticated: true });
  return {
    task: "cleanup-recent-matches",
    ok: result.payload?.ok === true,
    removed: result.payload?.removed || 0,
    remaining: result.payload?.remaining || 0,
  };
}

function maintenanceOffset(scheduledAt, pageSize, windowSize) {
  const runIndex = Math.floor(scheduledAt.getTime() / (2 * 60 * 60 * 1000));
  return (runIndex * pageSize) % windowSize;
}

async function syncProfiles(env, scheduledAt, tour) {
  const limit = Number.parseInt(env.DB_MAINTENANCE_PROFILE_LIMIT || "12", 10);
  const windowSize = Number.parseInt(env.DB_MAINTENANCE_PLAYER_WINDOW || "500", 10);
  const offset = maintenanceOffset(scheduledAt, limit, windowSize);
  const result = await callSite(env, `/api/db/sync-profiles?tour=${encodeURIComponent(tour)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`, { method: "POST", authenticated: true });
  return {
    task: `sync-profiles-${tour.toLowerCase()}`,
    ok: result.payload?.ok === true,
    offset,
    limit,
    requestedPlayers: result.payload?.requestedPlayers || 0,
    profilesFetched: result.payload?.profilesFetched || 0,
    seasonStatsUpserted: result.payload?.seasonStatsUpserted || 0,
    playersWithoutProfiles: result.payload?.playersWithoutProfiles || 0,
  };
}

async function runDbMaintenance(env, scheduledAt = new Date()) {
  const tour = Math.floor(scheduledAt.getUTCHours() / 2) % 2 === 0 ? "ATP" : "WTA";
  const results = [];
  results.push(await runSafely("refresh-predictions", () => refreshPredictions(env)));
  results.push(await runSafely("sync-outcomes", () => syncOutcomes(env, env.DB_MAINTENANCE_OUTCOME_DAYS || 180, env.DB_MAINTENANCE_OUTCOME_LIMIT || 60)));
  results.push(await runSafely("cleanup-recent-matches", () => cleanupRecentMatches(env)));
  results.push(await runSafely(`sync-profiles-${tour.toLowerCase()}`, () => syncProfiles(env, scheduledAt, tour)));
  return {
    task: "db-maintenance",
    cadence: "every-2-hours",
    selectedTour: tour,
    results,
  };
}

async function runSafely(task, action) {
  try {
    return await action();
  } catch (error) {
    return { task, ok: false, error: error.message };
  }
}

async function runTask(task, env, request) {
  if (task === "refresh") return refreshPredictions(env);
  if (task === "db-sync") return syncDatabase(env);
  if (task === "db-maintenance") return runDbMaintenance(env, new Date());
  if (task === "sync-outcomes") {
    const url = new URL(request.url);
    return syncOutcomes(env, url.searchParams.get("days") || 180, url.searchParams.get("limit") || 20);
  }
  if (task === "threads") return postThreadsPrediction(env, new URL(request.url).searchParams.get("lang") || "en");
  if (task === "human-threads") return postHumanThreads(env);
  if (task === "seo-article") return generateSeoArticle(env);
  if (task === "content-autopublish") return generateSeoArticle(env);
  if (task === "scheduled") {
    const url = new URL(request.url);
    const scheduledTime = url.searchParams.get("at") ? Date.parse(url.searchParams.get("at")) : Date.now();
    return runScheduled({ cron: "*/15 * * * *", scheduledTime }, env);
  }
  if (task === "all") {
    const results = [];
    results.push(await refreshPredictions(env));
    results.push(await postHumanThreads(env));
    results.push(await runDbMaintenance(env, new Date()));
    results.push(await generateSeoArticle(env));
    return { task: "all", results };
  }
  throw new Error(`Unknown task: ${task}`);
}

async function runScheduled(controller, env) {
  const cron = controller.cron;
  const scheduledAt = new Date(controller.scheduledTime || Date.now());
  const results = [];
  if (cron === "*/15 * * * *") {
    results.push(await runSafely("refresh-predictions", () => refreshPredictions(env)));
  }
  const configuredMaintenanceCron = env.DB_MAINTENANCE_CRON || "0 */2 * * *";
  if (cron === configuredMaintenanceCron || cron === "0 */2 * * *") {
    results.push(await runDbMaintenance(env, scheduledAt));
  }
  if (cron === "0 */4 * * *") {
    results.push(await runSafely("threads-human-autopost", () => postHumanThreads(env)));
  }
  const configuredDailyCron = env.CONTENT_AUTOPUBLISH_CRON || "0 6 * * *";
  if (cron === configuredDailyCron || cron === "0 6 * * *") {
    results.push(await runSafely("content-autopublish", () => generateSeoArticle(env)));
  }
  return { ok: true, cron, ranAt: new Date().toISOString(), results };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env).catch((error) => console.error("scheduled failed", error)));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const token = request.headers.get("x-sync-token") || url.searchParams.get("token");
    if (!env.SYNC_TOKEN || token !== env.SYNC_TOKEN) return json({ ok: false, error: "Unauthorized" }, 401);
    const task = url.searchParams.get("task") || "refresh";
    try {
      return json({ ok: true, ...(await runTask(task, env, request)) });
    } catch (error) {
      return json({ ok: false, task, error: error.message }, 500);
    }
  },
};
