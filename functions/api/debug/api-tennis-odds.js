const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";

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

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isAtpWtaSingles(fixture = {}) {
  const type = String(fixture.event_type_type || "").toLowerCase();
  return (type.includes("atp singles") || type.includes("wta singles"))
    && !type.includes("doubles")
    && !type.includes("itf")
    && !type.includes("challenger")
    && fixture.event_key;
}

function normalizeOddsPayload(payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload;
  return {};
}

function bestPrice(selection = {}) {
  let best = null;
  for (const [bookmaker, rawPrice] of Object.entries(selection)) {
    const price = Number.parseFloat(rawPrice);
    if (!Number.isFinite(price) || price <= 1) continue;
    if (!best || price > best.price) best = { bookmaker, price };
  }
  return best;
}

function summarizeArbitrage(matchOdds = {}) {
  const homeAway = matchOdds["Home/Away"] || matchOdds["home/away"] || null;
  const home = bestPrice(homeAway?.Home || homeAway?.home || {});
  const away = bestPrice(homeAway?.Away || homeAway?.away || {});
  if (!home || !away) {
    return {
      supported: false,
      reason: "No complete Home/Away market found in API-Tennis odds payload.",
      home,
      away,
    };
  }
  const impliedTotal = (1 / home.price) + (1 / away.price);
  const marginPercent = Math.round((1 - impliedTotal) * 10000) / 100;
  return {
    supported: true,
    arbitrage: impliedTotal < 1,
    impliedTotal: Math.round(impliedTotal * 10000) / 10000,
    marginPercent,
    home,
    away,
    note: impliedTotal < 1
      ? "The best returned API-Tennis Home/Away prices create theoretical arbitrage before fees, limits, latency and account restrictions."
      : "The best returned API-Tennis Home/Away prices do not create arbitrage.",
  };
}

function marketSummary(matchOdds = {}) {
  return Object.entries(matchOdds).slice(0, 12).map(([market, selections]) => ({
    market,
    selections: Object.entries(selections || {}).slice(0, 8).map(([selection, books]) => ({
      selection,
      bookmakers: Object.keys(books || {}).slice(0, 12),
      best: bestPrice(books || {}),
    })),
  }));
}

async function fetchApiTennis(env, method, params = {}) {
  const url = new URL(TENNIS_API_BASE);
  url.searchParams.set("method", method);
  url.searchParams.set("APIkey", env.API_TENNIS_KEY);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} returned ${response.status}`);
  return payload;
}

async function findFixtureWithOdds(env, requestUrl) {
  const explicitMatchKey = requestUrl.searchParams.get("match_key");
  if (explicitMatchKey) {
    const oddsPayload = await fetchApiTennis(env, "get_odds", { match_key: explicitMatchKey });
    return { fixture: null, oddsPayload };
  }

  const start = requestUrl.searchParams.get("date_start") || isoDate(0);
  const stop = requestUrl.searchParams.get("date_stop") || isoDate(7);
  const maxFixtures = Math.min(Math.max(Number.parseInt(requestUrl.searchParams.get("limit") || "8", 10), 1), 20);
  const fixturesPayload = await fetchApiTennis(env, "get_fixtures", { date_start: start, date_stop: stop });
  const fixtures = Array.isArray(fixturesPayload.result) ? fixturesPayload.result.filter(isAtpWtaSingles).slice(0, maxFixtures) : [];
  const attempts = [];

  for (const fixture of fixtures) {
    const oddsPayload = await fetchApiTennis(env, "get_odds", { match_key: fixture.event_key });
    attempts.push({
      event_key: fixture.event_key,
      match: `${fixture.event_first_player} vs ${fixture.event_second_player}`,
      success: oddsPayload.success,
      hasResult: Boolean(oddsPayload.result && Object.keys(normalizeOddsPayload(oddsPayload.result)).length),
    });
    if (oddsPayload.result && Object.keys(normalizeOddsPayload(oddsPayload.result)).length) return { fixture, oddsPayload, attempts };
  }
  return { fixture: fixtures[0] || null, oddsPayload: null, attempts };
}

async function testOdds(request, env) {
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  if (!env.API_TENNIS_KEY) return jsonResponse({ ok: false, error: "Missing API_TENNIS_KEY" }, 500);

  const requestUrl = new URL(request.url);
  const result = await findFixtureWithOdds(env, requestUrl);
  const oddsResult = normalizeOddsPayload(result.oddsPayload?.result);
  const matchKey = Object.keys(oddsResult)[0];
  const matchOdds = matchKey ? oddsResult[matchKey] : {};

  return jsonResponse({
    ok: Boolean(matchKey),
    method: "get_odds",
    fixture: result.fixture ? {
      event_key: result.fixture.event_key,
      event_date: result.fixture.event_date,
      event_time: result.fixture.event_time,
      event_type_type: result.fixture.event_type_type,
      tournament_name: result.fixture.tournament_name,
      match: `${result.fixture.event_first_player} vs ${result.fixture.event_second_player}`,
    } : null,
    matchKey: matchKey || requestUrl.searchParams.get("match_key") || null,
    rawSuccess: result.oddsPayload?.success ?? null,
    rawError: result.oddsPayload?.error || null,
    attemptedFixtures: result.attempts || [],
    marketCount: Object.keys(matchOdds || {}).length,
    markets: marketSummary(matchOdds),
    arbitrage: summarizeArbitrage(matchOdds),
  });
}

export async function onRequestGet({ request, env }) {
  try {
    return await testOdds(request, env);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}
