const CLOUDBET_API_BASE = "https://sports-api.cloudbet.com/pub/v2/odds";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isAuthorized(request, env) {
  if (!env.DATABASE_SYNC_TOKEN) return false;
  const url = new URL(request.url);
  const token = request.headers.get("x-sync-token") || url.searchParams.get("token");
  return token && token === env.DATABASE_SYNC_TOKEN;
}

async function fetchCloudbet(env, path) {
  const response = await fetch(`${CLOUDBET_API_BASE}${path}`, {
    headers: { accept: "application/json", "content-type": "application/json", "x-api-key": env.CLOUDBET_API_KEY },
  });
  if (!response.ok) throw new Error(`Cloudbet ${path} returned ${response.status}`);
  return response.json();
}

function competitionText(competition = {}) {
  return [competition.name, competition.key, competition.category?.name, competition.category?.key].filter(Boolean).join(" ");
}

function marketSummary(markets = {}) {
  return Object.entries(markets).slice(0, 20).map(([key, market]) => ({
    key,
    name: market?.name || market?.title || market?.description || "",
    status: market?.status || "",
    selectionCount: Object.values(market?.submarkets || market?.subMarkets || {}).flatMap((group) => group?.selections || []).length || market?.selections?.length || 0,
    selections: (Object.values(market?.submarkets || market?.subMarkets || {}).flatMap((group) => group?.selections || []).length ? Object.values(market?.submarkets || market?.subMarkets || {}).flatMap((group) => group?.selections || []) : market?.selections || []).slice(0, 4).map((selection) => ({
      name: selection.name,
      outcome: selection.outcome,
      price: selection.price || selection.odds,
      status: selection.status,
      side: selection.side,
      params: selection.params,
    })),
  }));
}

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  if (!env.CLOUDBET_API_KEY) return jsonResponse({ ok: false, error: "Missing Cloudbet key" }, 500);

  const sport = await fetchCloudbet(env, "/sports/tennis");
  const competitions = (sport?.categories || [])
    .flatMap((category) => (category.competitions || []).map((competition) => ({ ...competition, category })))
    .filter((competition) => competition.eventCount > 0)
    .filter((competition) => /singles/i.test(competitionText(competition)))
    .slice(0, 12);

  const samples = [];
  for (const competition of competitions) {
    const payload = await fetchCloudbet(env, `/competitions/${competition.key}`).catch((error) => ({ error: error.message, events: [] }));
    samples.push({
      competition: competitionText(competition),
      eventCount: competition.eventCount,
      payloadEventCount: payload.events?.length || 0,
      error: payload.error,
      events: (payload.events || []).slice(0, 3).map((event) => ({
        id: event.id,
        key: event.key,
        name: event.name,
        status: event.status,
        startTime: event.startTime,
        cutoffTime: event.cutoffTime,
        home: event.home?.name,
        away: event.away?.name,
        marketCount: Object.keys(event.markets || {}).length,
        markets: marketSummary(event.markets),
      })),
    });
  }

  return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), samples });
}
