const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const CLOUDBET_API_BASE = "https://sports-api.cloudbet.com/pub/v2/odds";
const CLOUDBET_MARKETS_QUERY = "?markets=tennis.winner&markets=tennis.winner_and_total";
const DEFAULT_CLOUDBET_AFFILIATE_URL = "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Arbitrage&aftm_cid=4";
const BLOCKED_RE = /\b(simulated|simulation|virtual|srl|reality league|itf|utr|exhibition|junior|boys|girls|college|doubles)\b/i;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function findMemberByToken(env, token) {
  if (!env.TENNIS_DB || !token) return null;
  const tokenHash = await hashToken(token);
  try {
    const member = await env.TENNIS_DB.prepare("SELECT id, email, name, status FROM members WHERE token_hash = ? AND status = 'active'").bind(tokenHash).first();
    if (member?.id) {
      await env.TENNIS_DB.prepare("UPDATE members SET last_seen_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(member.id).run();
      return member;
    }
  } catch (error) {
    return null;
  }
  return null;
}

async function authenticate(request, env) {
  const url = new URL(request.url);
  const token = request.headers.get("x-member-token") || request.headers.get("x-sync-token") || url.searchParams.get("token");
  const adminToken = env.ARBITRAGE_MEMBER_TOKEN || env.MEMBER_ACCESS_TOKEN || env.DATABASE_SYNC_TOKEN || env.SYNC_TOKEN;
  if (adminToken && token === adminToken) return { type: "admin", member: null };
  const member = await findMemberByToken(env, token);
  if (member) return { type: "member", member };
  return null;
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

function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesLookSimilar(a, b) {
  const left = normalizeName(a).split(" ").filter(Boolean);
  const right = normalizeName(b).split(" ").filter(Boolean);
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right);
  const shared = left.filter((part) => rightSet.has(part));
  const sameLastName = left.at(-1) === right.at(-1);
  const firstInitialMatches = left[0]?.slice(0, 1) && left[0].slice(0, 1) === right[0]?.slice(0, 1);
  const eitherFirstNameIsInitial = (left[0]?.length || 0) === 1 || (right[0]?.length || 0) === 1;
  return sameLastName && (shared.length >= 2 || left.length === 1 || right.length === 1 || firstInitialMatches || eitherFirstNameIsInitial);
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

function calculateHomeAwayOpportunity(fixture, matchOdds = {}, bankroll = 100, cloudbet = null, cloudbetAffiliateUrl = DEFAULT_CLOUDBET_AFFILIATE_URL) {
  const homeAway = getHomeAwayMarket(matchOdds);
  const homeBooks = { ...(homeAway?.Home || homeAway?.home || {}) };
  const awayBooks = { ...(homeAway?.Away || homeAway?.away || {}) };
  if (cloudbet?.home) homeBooks.Cloudbet = cloudbet.home;
  if (cloudbet?.away) awayBooks.Cloudbet = cloudbet.away;
  const home = bestPrice(homeBooks);
  const away = bestPrice(awayBooks);
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
    cloudbet: cloudbet ? {
      available: true,
      home: cloudbet.home,
      away: cloudbet.away,
      homeName: cloudbet.homeName,
      awayName: cloudbet.awayName,
      marketType: cloudbet.marketType,
      affiliateUrl: cloudbetAffiliateUrl,
    } : { available: false },
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

async function fetchCloudbet(env, path) {
  if (!env.CLOUDBET_API_KEY) return null;
  const response = await fetch(`${CLOUDBET_API_BASE}${path}`, {
    headers: { accept: "application/json", "content-type": "application/json", "x-api-key": env.CLOUDBET_API_KEY },
  });
  if (!response.ok) throw new Error(`Cloudbet ${path} returned ${response.status}`);
  return response.json();
}

function competitionText(competition = {}) {
  return [competition.name, competition.key, competition.category?.name, competition.category?.key].filter(Boolean).join(" ");
}

function eventText(event = {}) {
  return [event.name, event.key, event.home?.name, event.away?.name, competitionText(event.competition || {})].filter(Boolean).join(" ");
}

function isCloudbetUpcoming(event = {}) {
  const status = String(event.status || "").toLowerCase();
  return !/finished|ended|complete|retired|walkover|cancelled|canceled|abandoned|settled/.test(status);
}

function asPrice(value) {
  const price = Number.parseFloat(value);
  return Number.isFinite(price) && price >= 1.01 ? price : null;
}

function cloudbetSelectionsFromMarket(market = {}) {
  const submarkets = market.submarkets || market.subMarkets || {};
  const grouped = Object.values(submarkets).flatMap((group) => group?.selections || []);
  return grouped.length ? grouped : market.selections || [];
}

function cloudbetSelectionEnabled(selection = {}) {
  return asPrice(selection.price || selection.odds) && (!selection.status || selection.status === "SELECTION_ENABLED") && (!selection.side || selection.side === "BACK");
}

function cloudbetSelectionMatches(selection, side, playerName) {
  const value = [selection.outcome, selection.name, selection.label, selection.params].filter(Boolean).join(" ").toLowerCase();
  const sideTerms = side === "home" ? /\b(home|player1|player_1|competitor1|competitor_1|1)\b/ : /\b(away|player2|player_2|competitor2|competitor_2|2)\b/;
  return sideTerms.test(value) || normalizeName(value) === normalizeName(playerName);
}

function syntheticCloudbetOddsFromWinnerAndTotal(market, event) {
  const selections = cloudbetSelectionsFromMarket(market).filter(cloudbetSelectionEnabled);
  const homeSelections = selections.filter((selection) => String(selection.outcome || "").toLowerCase().startsWith("home_and_"));
  const awaySelections = selections.filter((selection) => String(selection.outcome || "").toLowerCase().startsWith("away_and_"));
  if (!homeSelections.length || !awaySelections.length) return null;
  const homeRaw = homeSelections.reduce((sum, selection) => sum + 1 / asPrice(selection.price || selection.odds), 0);
  const awayRaw = awaySelections.reduce((sum, selection) => sum + 1 / asPrice(selection.price || selection.odds), 0);
  if (!homeRaw || !awayRaw) return null;
  const home = 1 / homeRaw;
  const away = 1 / awayRaw;
  if (home < 1.01 || away < 1.01) return null;
  return {
    home: Math.round(home * 100) / 100,
    away: Math.round(away * 100) / 100,
    homeName: event.home.name,
    awayName: event.away.name,
    marketType: "derived winner side from winner_and_total",
  };
}

function extractCloudbetOdds(event = {}) {
  if (!event?.home?.name || !event?.away?.name || !isCloudbetUpcoming(event)) return null;
  const markets = event.markets || {};
  const directEntry = Object.entries(markets).find(([key, market]) => {
    const name = String(market?.name || market?.title || "").toLowerCase();
    const marketKey = key.toLowerCase();
    return marketKey === "tennis.winner" || marketKey.endsWith(".winner") || marketKey.includes("match_winner") || name.includes("match winner") || name.includes("moneyline") || name.includes("match odds");
  });
  if (directEntry) {
    const [marketKey, market] = directEntry;
    const selections = cloudbetSelectionsFromMarket(market).filter(cloudbetSelectionEnabled);
    let homeSelection = selections.find((selection) => cloudbetSelectionMatches(selection, "home", event.home.name));
    let awaySelection = selections.find((selection) => cloudbetSelectionMatches(selection, "away", event.away.name));
    if ((!homeSelection || !awaySelection) && selections.length === 2) [homeSelection, awaySelection] = selections;
    const home = asPrice(homeSelection?.price || homeSelection?.odds);
    const away = asPrice(awaySelection?.price || awaySelection?.odds);
    if (home && away) return { home, away, homeName: event.home.name, awayName: event.away.name, marketType: `match winner (${marketKey})` };
  }
  if (markets["tennis.winner_and_total"]) return syntheticCloudbetOddsFromWinnerAndTotal(markets["tennis.winner_and_total"], event);
  return null;
}

async function getCloudbetOddsMap(env, fixtures = []) {
  const result = { matches: [], diagnostics: { hasCloudbetApiKey: Boolean(env.CLOUDBET_API_KEY), scannedCompetitions: 0, pricedEvents: 0 } };
  if (!env.CLOUDBET_API_KEY || !fixtures.length) return result;

  const sport = await fetchCloudbet(env, "/sports/tennis").catch(() => null);
  const competitions = (sport?.categories || [])
    .flatMap((category) => (category.competitions || []).map((competition) => ({ ...competition, category })))
    .filter((competition) => competition.eventCount > 0)
    .filter((competition) => !BLOCKED_RE.test(competitionText(competition)))
    .sort((a, b) => (b.eventCount || 0) - (a.eventCount || 0))
    .slice(0, 500);
  result.diagnostics.scannedCompetitions = competitions.length;

  const payloads = [];
  for (let i = 0; i < competitions.length; i += 25) {
    payloads.push(...await Promise.all(competitions.slice(i, i + 25).map(async (competition) => ({
      competition,
      payload: await fetchCloudbet(env, `/competitions/${competition.key}${CLOUDBET_MARKETS_QUERY}`).catch(() => fetchCloudbet(env, `/competitions/${competition.key}`).catch(() => null)),
    }))));
  }

  const events = payloads.flatMap(({ competition, payload }) => (payload?.events || []).map((event) => ({ ...event, competition: event.competition || competition })));
  result.matches = events
    .filter((event) => !BLOCKED_RE.test(eventText(event)))
    .map((event) => ({ event, odds: extractCloudbetOdds(event) }))
    .filter((item) => item.odds)
    .map(({ event, odds }) => ({ playerA: event.home.name, playerB: event.away.name, tournament: event.competition?.name || event.name || "Cloudbet Tennis", odds }));
  result.diagnostics.pricedEvents = result.matches.length;
  return result;
}

function findCloudbetForFixture(fixture = {}, cloudbetMatches = []) {
  for (const match of cloudbetMatches) {
    const sameOrder = namesLookSimilar(fixture.event_first_player, match.playerA) && namesLookSimilar(fixture.event_second_player, match.playerB);
    if (sameOrder) return match.odds;
    const reversed = namesLookSimilar(fixture.event_first_player, match.playerB) && namesLookSimilar(fixture.event_second_player, match.playerA);
    if (reversed) return { ...match.odds, home: match.odds.away, away: match.odds.home, homeName: match.playerB, awayName: match.playerA };
  }
  return null;
}

async function scanUpcomingFixtures(env, options) {
  const fixturesPayload = await fetchApiTennis(env, "get_fixtures", {
    date_start: options.dateStart,
    date_stop: options.dateStop,
  });
  const fixtures = (Array.isArray(fixturesPayload.result) ? fixturesPayload.result : [])
    .filter(isAtpWtaSingles)
    .slice(0, options.scanLimit);

  const cloudbet = await getCloudbetOddsMap(env, fixtures).catch((error) => ({ matches: [], diagnostics: { error: error.message, hasCloudbetApiKey: Boolean(env.CLOUDBET_API_KEY) } }));
  const cloudbetAffiliateUrl = (env.CLOUDBET_AFFILIATE_URL || DEFAULT_CLOUDBET_AFFILIATE_URL).trim();
  const checked = [];
  const opportunities = [];

  for (const fixture of fixtures) {
    try {
      const oddsPayload = await fetchApiTennis(env, "get_odds", { match_key: fixture.event_key });
      const oddsResult = normalizeOddsPayload(oddsPayload.result);
      const matchKey = oddsResult[String(fixture.event_key)] ? String(fixture.event_key) : Object.keys(oddsResult)[0];
      const matchOdds = matchKey ? oddsResult[matchKey] : {};
      const cloudbetOdds = findCloudbetForFixture(fixture, cloudbet.matches);
      const opportunity = calculateHomeAwayOpportunity(fixture, matchOdds, options.bankroll, cloudbetOdds, cloudbetAffiliateUrl);
      checked.push({
        eventKey: fixture.event_key,
        match: `${fixture.event_first_player || ""} vs ${fixture.event_second_player || ""}`,
        marketCount: marketCount(matchOdds),
        hasHomeAway: Boolean(opportunity),
        hasCloudbet: Boolean(cloudbetOdds),
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

  return { fixturesScanned: fixtures.length, checked, opportunities, cloudbetDiagnostics: cloudbet.diagnostics };
}

async function getArbitrage(request, env) {
  const auth = await authenticate(request, env);
  if (!auth) return jsonResponse({ ok: false, error: "Members only" }, 401);
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
    authType: auth.type,
    member: auth.member ? { email: auth.member.email, name: auth.member.name || "" } : null,
    options,
    summary: {
      fixturesScanned: upcoming.fixturesScanned,
      pricedMatches: rows.length,
      arbitrageCount: rows.filter((item) => item.arbitrage).length,
      cloudbetMatches: rows.filter((item) => item.cloudbet?.available).length,
      bestEdgePercent: rows.length ? rows[0].edgePercent : null,
    },
    opportunities: rows,
    checked: upcoming.checked.slice(0, 40),
    cloudbetDiagnostics: upcoming.cloudbetDiagnostics,
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
