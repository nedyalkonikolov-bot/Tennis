const CLOUDBET_API_BASE = "https://sports-api.cloudbet.com/pub/v2/odds";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isAuthorized(request, env) {
  const url = new URL(request.url);
  const token = request.headers.get("x-sync-token") || url.searchParams.get("token");
  return env.DATABASE_SYNC_TOKEN && token === env.DATABASE_SYNC_TOKEN;
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

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  const sport = await fetchCloudbet(env, "/sports/tennis");
  const competitions = (sport?.categories || [])
    .flatMap((category) => (category.competitions || []).map((competition) => ({ ...competition, category })))
    .filter((competition) => competition.eventCount > 0)
    .filter((competition) => /\b(atp|wta)\b/i.test(competitionText(competition)))
    .filter((competition) => /singles/i.test(competitionText(competition)))
    .slice(0, 20);

  const samples = [];
  for (const competition of competitions) {
    const payload = await fetchCloudbet(env, `/competitions/${competition.key}`).catch((error) => ({ error: error.message, events: [] }));
    samples.push({
      competition: competitionText(competition),
      eventCount: competition.eventCount,
      payloadEventCount: payload.events?.length || 0,
      events: (payload.events || []).map((event) => ({
        id: event.id,
        key: event.key,
        name: event.name,
        status: event.status,
        startTime: event.startTime,
        cutoffTime: event.cutoffTime,
        home: event.home?.name,
        away: event.away?.name,
        marketKeys: Object.keys(event.markets || {}),
      })),
    });
  }
  return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), samples });
}
