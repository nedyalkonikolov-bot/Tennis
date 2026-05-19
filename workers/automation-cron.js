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
  const lang = encodeURIComponent(language);
  const postStyle = encodeURIComponent(style);
  const result = await callSite(env, `/api/automation/promote?platform=threads&limit=1&lang=${lang}&style=${postStyle}`, { method: "POST", authenticated: true });
  return {
    task: "threads-autopost",
    language,
    style,
    ok: result.payload?.ok === true,
    posted: result.payload?.threads?.filter((item) => item.result?.ok).length || 0,
    skipped: result.payload?.threads?.filter((item) => item.skipped).length || 0,
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
  const result = await callSite(env, "/api/automation/articles?limit=1&source=mixed", { method: "POST", authenticated: true });
  return {
    task: "seo-article",
    ok: result.payload?.ok === true,
    generated: result.payload?.generated?.length || 0,
    skipped: result.payload?.skipped || null,
    article: result.payload?.generated?.[0]?.article?.url || null,
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
  if (task === "threads") return postThreadsPrediction(env, new URL(request.url).searchParams.get("lang") || "en");
  if (task === "human-threads") return postHumanThreads(env);
  if (task === "seo-article") return generateSeoArticle(env);
  if (task === "scheduled") {
    const url = new URL(request.url);
    const scheduledTime = url.searchParams.get("at") ? Date.parse(url.searchParams.get("at")) : Date.now();
    return runScheduled({ cron: "*/15 * * * *", scheduledTime }, env);
  }
  if (task === "all") {
    const results = [];
    results.push(await refreshPredictions(env));
    results.push(await postHumanThreads(env));
    results.push(await generateSeoArticle(env));
    results.push(await syncDatabase(env));
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
    if (scheduledAt.getUTCHours() === 2 && scheduledAt.getUTCMinutes() === 15) results.push(await runSafely("db-sync", () => syncDatabase(env)));
  }
  if (cron === "0 */4 * * *") {
    results.push(await runSafely("threads-human-autopost", () => postHumanThreads(env)));
  }
  if (cron === "30 */12 * * *") {
    results.push(await runSafely("seo-article", () => generateSeoArticle(env)));
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
