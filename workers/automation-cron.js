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

function scheduledPostStyle(scheduledAt) {
  const slot = Math.floor(scheduledAt.getTime() / (15 * 60 * 1000));
  return slot % 4 === 0 ? "news" : "prediction";
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
  if (task === "scheduled") {
    const url = new URL(request.url);
    const scheduledTime = url.searchParams.get("at") ? Date.parse(url.searchParams.get("at")) : Date.now();
    return runScheduled({ cron: "*/15 * * * *", scheduledTime }, env);
  }
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
    const minute = scheduledAt.getUTCMinutes();
    const style = scheduledPostStyle(scheduledAt);
    if (minute === 0) results.push(await runSafely("threads-autopost:hi", () => postThreadsPrediction(env, "hi", style)));
    if (minute === 15) results.push(await runSafely("threads-autopost:pt-BR", () => postThreadsPrediction(env, "pt-BR", style)));
    if (minute === 30) results.push(await runSafely("threads-autopost:es", () => postThreadsPrediction(env, "es", style)));
    if (minute === 45) results.push(await runSafely("threads-autopost:tr", () => postThreadsPrediction(env, "tr", style)));
    results.push(await runSafely("refresh-predictions", () => refreshPredictions(env)));
    if (scheduledAt.getUTCHours() === 2 && scheduledAt.getUTCMinutes() === 15) results.push(await runSafely("db-sync", () => syncDatabase(env)));
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
