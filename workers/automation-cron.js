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
  const cacheBust = encodeURIComponent(`cf-cron-${Date.now()}`);
  const result = await callSite(env, `/api/live-data?ts=${cacheBust}`);
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

async function postThreadsPrediction(env, language = "en") {
  const lang = encodeURIComponent(language);
  const result = await callSite(env, `/api/automation/promote?platform=threads&limit=1&lang=${lang}`, { method: "POST", authenticated: true });
  return {
    task: "threads-autopost",
    language,
    ok: result.payload?.ok === true,
    posted: result.payload?.threads?.filter((item) => item.result?.ok).length || 0,
    skipped: result.payload?.threads?.filter((item) => item.skipped).length || 0,
  };
}

async function runTask(task, env, request) {
  if (task === "refresh") return refreshPredictions(env);
  if (task === "db-sync") return syncDatabase(env);
  if (task === "threads") return postThreadsPrediction(env, new URL(request.url).searchParams.get("lang") || "en");
  if (task === "all") {
    const results = [];
    results.push(await refreshPredictions(env));
    results.push(await postThreadsPrediction(env, "en"));
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
    results.push(await refreshPredictions(env));
    if (scheduledAt.getUTCHours() === 2 && scheduledAt.getUTCMinutes() === 15) results.push(await syncDatabase(env));
  }
  if (cron === "7 * * * *") results.push(await postThreadsPrediction(env, "hi"));
  if (cron === "22 * * * *") results.push(await postThreadsPrediction(env, "pt-BR"));
  if (cron === "37 * * * *") results.push(await postThreadsPrediction(env, "es"));
  if (cron === "52 * * * *") results.push(await postThreadsPrediction(env, "tr"));
  return { ok: true, cron, ranAt: new Date().toISOString(), results };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env));
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