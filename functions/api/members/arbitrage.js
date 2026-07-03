const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}

function isAuthorized(request, env) {
  const expected = env.ARBITRAGE_MEMBER_TOKEN || env.MEMBER_ACCESS_TOKEN || env.DATABASE_SYNC_TOKEN || env.SYNC_TOKEN;
  if (!expected) return false;
  const url = new URL(request.url);
  const token = request.headers.get("x-member-token") || request.headers.get("x-sync-token") || url.searchParams.get("token");
  return token && token === expected;
}

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isAtpWtaSingles(fixture = {}) {
  const eventType = String(fixture.event_type_type || "").toLowerCase();
  const tournament = String(fixture.tournament_name || fixture.league_name || "").toLowerCase();
  const players = `${fixture.event_first_player || ""} ${fixture.event_second_player || ""}`;
  return (eventType.includes("atp singles") || eventType.includes("wta singles"))
    && !eventType.includes("doubles")
    && !eventType.includes("itf")
    && !eventType.includes("challenger")
    && !tournament.includes("simulated")
    && !players.includes("/")
    && fixture.event_key;
}

function parsePrice(value) {
  const price = Number.parseFloat(value);
  return Number.isFinite(price) && price > 1.01 ? price : null;
}

function bestPrice(bookPrices = {}) {
  let best = null;
  for (const [bookmaker, rawPrice] of Object.entries(bookPrices || {})) {
    const price = parsePrice(rawPrice);
    if (!price) continue;
    if (!best || price > best.price) best = { bookmaker, price };
  }
  return best;
}

function normalizeOddsPayload(payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload;
  return {};
}

function getHomeAwayMarket(matchOdds = {}) {
  return matchOdds["Home/Away"]
    || matchOdds["home/away"]
    || matchOdds["Match Winner"]
    || matchOdds["Winner"]
    || null;
}

function calculateHomeAwayOpportunity(fixture, matchOdds = {}, bankroll = 100) {
  const homeAway = getHomeAwayMarket(matchOdds);
  const home = bestPrice(homeAway?.Home || homeAway?.home || {});
  const away = bestPrice(homeAway?.Away || homeAway?.away || {});
  if (!home || !away) return null;

  const impliedTotal = (1 / home.price) + (1 / away.price);
  const edgePercent = (1 - impliedTotal) * 100;
  const stakeHome = ((1 / home.price) / impliedTotal) * bankroll;
  const stakeAway = bankroll - stakeHome;
  const payout = stakeHome * home.price;
  const profit = payout - bankroll;

  return {
    eventKey: String(fixture.event_key),
    match: `${fixture.event_first_player || "Player A"} vs ${fixture.event_second_player || "Player B"}`,
    playerA: fixture.event_first_player || "",
    playerB: fixture.event_second_player || "",
    tour: String(fixture.event_type_type || "").toLowerCase().includes("wta") ? "WTA" : "ATP",
    tournament: fixture.tournament_name || fixture.league_name || "Tennis",
    startDate: fixture.event_date || "",
    startTime: fixture.event_time || "",
    market: "Home/Away",
    arbitrage: impliedTotal < 1,
    impliedTotal: Math.round(impliedTotal * 10000) / 10000,
    edgePercent: Math.round(edgePercent * 100) / 100,
    bestHome: home,
    bestAway: away,
    stakePlan: {
      bankroll,
      homeStake: Math.round(stakeHome * 100) / 100,
      awayStake: Math.round(stakeAway * 100) / 100,
      expectedProfit: Math.round(profit * 100) / 100,
      expectedReturnPercent: Math.round((profit / bankroll) * 10000) / 100,
    },
  };
}

function marketCount(matchOdds = {}) {
  return Object.keys(matchOdds || {}).length;
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

async function scanUpcomingFixtures(env, options) {
  const fixturesPayload = await fetchApiTennis(env, "get_fixtures", {
    date_start: options.dateStart,
    date_stop: options.dateStop,
  });
  const fixtures = (Array.isArray(fixturesPayload.result) ? fixturesPayload.result : [])
    .filter(isAtpWtaSingles)
    .slice(0, options.scanLimit);

  const checked = [];
  const opportunities = [];

  for (const fixture of fixtures) {
    try {
      const oddsPayload = await fetchApiTennis(env, "get_odds", { match_key: fixture.event_key });
      const oddsResult = normalizeOddsPayload(oddsPayload.result);
      const matchKey = oddsResult[String(fixture.event_key)] ? String(fixture.event_key) : Object.keys(oddsResult)[0];
      const matchOdds = matchKey ? oddsResult[matchKey] : {};
      const opportunity = calculateHomeAwayOpportunity(fixture, matchOdds, options.bankroll);
      checked.push({
        eventKey: fixture.event_key,
        match: `${fixture.event_first_player || ""} vs ${fixture.event_second_player || ""}`,
        marketCount: marketCount(matchOdds),
        hasHomeAway: Boolean(opportunity),
      });
      if (opportunity) opportunities.push(opportunity);
    } catch (error) {
      checked.push({
        eventKey: fixture.event_key,
        match: `${fixture.event_first_player || ""} vs ${fixture.event_second_player || ""}`,
        error: error.message,
      });
    }
  }

  return { fixturesScanned: fixtures.length, checked, opportunities };
}

async function getArbitrage(request, env) {
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Members only" }, 401);
  if (!env.API_TENNIS_KEY) return jsonResponse({ ok: false, error: "Missing API_TENNIS_KEY" }, 500);

  const url = new URL(request.url);
  const options = {
    dateStart: url.searchParams.get("date_start") || isoDate(0),
    dateStop: url.searchParams.get("date_stop") || isoDate(7),
    scanLimit: Math.min(Math.max(Number.parseInt(url.searchParams.get("scan") || "40", 10), 1), 80),
    bankroll: Math.min(Math.max(Number.parseFloat(url.searchParams.get("bankroll") || "100"), 1), 100000),
  };

  const upcoming = await scanUpcomingFixtures(env, options);
  const rows = upcoming.opportunities
    .sort((a, b) => Number(b.arbitrage) - Number(a.arbitrage) || b.edgePercent - a.edgePercent)
    .slice(0, 80);

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    source: "API-Tennis get_fixtures + get_odds",
    memberOnly: true,
    options,
    summary: {
      fixturesScanned: upcoming.fixturesScanned,
      pricedMatches: rows.length,
      arbitrageCount: rows.filter((item) => item.arbitrage).length,
      bestEdgePercent: rows.length ? rows[0].edgePercent : null,
    },
    opportunities: rows,
    checked: upcoming.checked.slice(0, 40),
    note: "Arbitrage is theoretical before odds latency, stake limits, void rules, KYC restrictions and bookmaker terms. Recheck prices manually before acting.",
  });
}

export async function onRequestGet({ request, env }) {
  try {
    return await getArbitrage(request, env);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}
