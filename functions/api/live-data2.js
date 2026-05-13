const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const CLOUDBET_API_BASE = "https://sports-api.cloudbet.com/pub/v2/odds";
const TENNIS_RSS = "https://www.tennis.com/roots/rss-feeds/news/";
const DEFAULT_BET_URL = "https://www.cloudbet.com/en/sports/tennis";
const DEFAULT_NEWS_IMAGE = "https://images.tennis.com/image/upload/t_q-best/tenniscom-prd/colectyfnidvc41bazww.jpg";
const PLAYER_CACHE_KEY = "players:standings:v1";
const PLAYER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PLAYER_LIMIT = 500;
const RECENT_FORM_DAYS = 100;
const BLOCKED_RE = /\b(simulated|simulation|virtual|srl|reality league|itf|utr|challenger|exhibition|junior|boys|girls|college|davis|billie|hopman)\b/i;

const fallbackPlayers = [
  { id: "demo-1", playerKey: "", name: "Jannik Sinner", sex: "ATP", tour: "ATP", rank: 1, points: 10550, country: "Italy", movement: "same", form: 88, hold: 91, breakRate: 28, clay: 84, hard: 92, grass: 79, trend: "+6" },
  { id: "demo-2", playerKey: "", name: "Carlos Alcaraz", sex: "ATP", tour: "ATP", rank: 2, points: 8850, country: "Spain", movement: "same", form: 84, hold: 88, breakRate: 31, clay: 91, hard: 86, grass: 83, trend: "+3" },
  { id: "demo-3", playerKey: "", name: "Iga Swiatek", sex: "WTA", tour: "WTA", rank: 1, points: 9200, country: "Poland", movement: "same", form: 92, hold: 82, breakRate: 46, clay: 96, hard: 88, grass: 73, trend: "+8" },
];
const fallbackNews = [{ id: "fallback-news", title: "Tennis news loading", category: "News", time: "Latest", summary: "Live Tennis.com RSS headlines will appear after the feed responds.", url: "#", imageUrl: DEFAULT_NEWS_IMAGE, source: "TennisTipz" }];

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=180, stale-while-revalidate=900" } });
}
function asInt(value, fallback = 0) { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? parsed : fallback; }
function asFloat(value, fallback = null) { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function cleanText(value = "") { return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }
function normalizeName(value = "") { return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim(); }
function namesLookSimilar(a, b) { const left = normalizeName(a).split(" ").filter(Boolean); const right = normalizeName(b).split(" ").filter(Boolean); if (!left.length || !right.length) return false; const rightSet = new Set(right); const shared = left.filter((part) => rightSet.has(part)); return left.at(-1) === right.at(-1) && (shared.length >= 2 || left.length === 1 || right.length === 1); }
function getPlayerCache(env) { return env.TENNIS_PLAYERS_CACHE || env.PLAYER_STATS_KV || env.PLAYERS_KV || null; }

async function fetchApiTennis(env, method, params = {}) {
  if (!env.API_TENNIS_KEY) return [];
  const url = new URL(TENNIS_API_BASE);
  url.searchParams.set("method", method);
  url.searchParams.set("APIkey", env.API_TENNIS_KEY);
  Object.entries(params).forEach(([key, value]) => value !== undefined && value !== null && value !== "" && url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${method} returned ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.result) ? payload.result : [];
}
function normalizePlayer(player, tour) {
  const rank = asInt(player.place || player.player_place || player.rank || player.standing_place, 999);
  const name = player.player || player.player_name || player.name || "Unknown player";
  const seed = rank === 999 ? name.length : rank;
  return { id: String(player.player_key || player.player_id || `${tour}-${name}`), playerKey: String(player.player_key || player.player_id || ""), name, sex: tour, tour, rank, points: asInt(player.points, 0), country: player.country || player.player_country || "World", movement: player.movement || "same", form: Math.max(52, 96 - Math.min(seed, 44)), hold: 65 + (seed % 28), breakRate: 18 + (seed % 24), clay: 62 + ((seed + 9) % 32), hard: 62 + ((seed + 17) % 32), grass: 58 + ((seed + 23) % 30), trend: player.movement === "up" ? "+" : player.movement === "down" ? "-" : "0" };
}
function slicePlayers(players, limit = PLAYER_LIMIT) { return [...players.filter((p) => p.tour === "ATP").slice(0, limit), ...players.filter((p) => p.tour === "WTA").slice(0, limit)]; }
async function getPlayers(env) {
  const cache = getPlayerCache(env);
  if (cache) {
    const cached = await cache.get(PLAYER_CACHE_KEY, "json").catch(() => null);
    const cachedAt = cached?.updatedAt ? Date.parse(cached.updatedAt) : 0;
    if (cached?.players?.length && Date.now() - cachedAt < PLAYER_CACHE_MAX_AGE_MS) return slicePlayers(cached.players);
  }
  const [atp, wta] = await Promise.all([
    fetchApiTennis(env, "get_standings", { event_type: "ATP" }).catch(() => []),
    fetchApiTennis(env, "get_standings", { event_type: "WTA" }).catch(() => []),
  ]);
  const players = [...atp.slice(0, PLAYER_LIMIT).map((p) => normalizePlayer(p, "ATP")), ...wta.slice(0, PLAYER_LIMIT).map((p) => normalizePlayer(p, "WTA"))];
  if (cache && players.length) await cache.put(PLAYER_CACHE_KEY, JSON.stringify({ updatedAt: new Date().toISOString(), players }), { expirationTtl: 3 * 24 * 60 * 60 }).catch(() => null);
  return players;
}

async function fetchCloudbet(env, path) {
  if (!env.CLOUDBET_API_KEY) return null;
  const response = await fetch(`${CLOUDBET_API_BASE}${path}`, { headers: { accept: "application/json", "content-type": "application/json", "x-api-key": env.CLOUDBET_API_KEY } });
  if (!response.ok) throw new Error(`Cloudbet ${path} returned ${response.status}`);
  return response.json();
}
function competitionText(competition = {}) { return [competition.name, competition.key, competition.category?.name, competition.category?.key].filter(Boolean).join(" "); }
function eventText(event = {}) { return [event.name, event.key, event.home?.name, event.away?.name, competitionText(event.competition || {})].filter(Boolean).join(" "); }
function tourFromText(value = "") { const text = String(value).toLowerCase(); if (/\bwta\b|women|female/.test(text)) return "WTA"; if (/\batp\b|\bmen\b|male/.test(text)) return "ATP"; return ""; }
function isDoubles(event = {}) { const text = eventText(event).toLowerCase(); return text.includes("doubles") || String(event.home?.name || "").includes("/") || String(event.away?.name || "").includes("/"); }
function isFinished(event = {}) { const status = String(event.status || "").toLowerCase(); return /finished|ended|complete|retired|walkover|cancelled|canceled|abandoned|settled/.test(status); }
function isLive(event = {}) { const status = String(event.status || "").toLowerCase(); return status.includes("live") || status.includes("in_progress"); }
function isUpcoming(event = {}) { const status = String(event.status || "").toLowerCase(); return !isFinished(event) && (isLive(event) || !status || /trading|scheduled|pre_trading|not started|upcoming/.test(status)); }
function inferSurface(event = {}) { const text = eventText(event).toLowerCase(); if (/grass|wimbledon|halle|queens/.test(text)) return "Grass"; if (/clay|rome|madrid|roland|monte|parma|paris/.test(text)) return "Clay"; return "Hard"; }
function selectionsFromMarket(market) { const submarkets = market?.submarkets || market?.subMarkets || {}; const grouped = Object.values(submarkets).flatMap((group) => group?.selections || []); return grouped.length ? grouped : market?.selections || []; }
function enabled(selection) { const price = asFloat(selection?.price || selection?.odds); return price && (!selection.status || selection.status === "SELECTION_ENABLED") && (!selection.side || selection.side === "BACK"); }
function selectionMatches(selection, side, playerName) { const value = [selection.outcome, selection.name, selection.label, selection.params].filter(Boolean).join(" ").toLowerCase(); const sideTerms = side === "home" ? /\b(home|player1|player_1|competitor1|competitor_1|1)\b/ : /\b(away|player2|player_2|competitor2|competitor_2|2)\b/; return sideTerms.test(value) || normalizeName(value) === normalizeName(playerName); }
function syntheticOddsFromWinnerAndTotal(market, event) {
  const selections = selectionsFromMarket(market).filter(enabled);
  const homeSelections = selections.filter((selection) => String(selection.outcome || "").toLowerCase().startsWith("home_and_"));
  const awaySelections = selections.filter((selection) => String(selection.outcome || "").toLowerCase().startsWith("away_and_"));
  if (!homeSelections.length || !awaySelections.length) return null;
  const homeRaw = homeSelections.reduce((sum, selection) => sum + 1 / asFloat(selection.price || selection.odds), 0);
  const awayRaw = awaySelections.reduce((sum, selection) => sum + 1 / asFloat(selection.price || selection.odds), 0);
  if (!homeRaw || !awayRaw) return null;
  return { home: (1 / homeRaw).toFixed(2), away: (1 / awayRaw).toFixed(2), marketKey: "tennis.winner_and_total", marketType: "derived winner side from winner_and_total", marketUrlHome: "tennis.winner_and_total/home", marketUrlAway: "tennis.winner_and_total/away", eventId: event.id, eventKey: event.key, eventName: event.name, homeName: event.home.name, awayName: event.away.name };
}
function extractOdds(event) {
  if (!event?.home?.name || !event?.away?.name || isFinished(event)) return null;
  const markets = event.markets || {};
  const directEntry = Object.entries(markets).find(([key, market]) => {
    const name = String(market?.name || market?.title || "").toLowerCase();
    const marketKey = key.toLowerCase();
    return marketKey === "tennis.winner" || marketKey.endsWith(".winner") || marketKey.includes("match_winner") || name.includes("match winner") || name.includes("moneyline") || name.includes("match odds");
  });
  if (directEntry) {
    const [marketKey, market] = directEntry;
    const selections = selectionsFromMarket(market).filter(enabled);
    let homeSelection = selections.find((selection) => selectionMatches(selection, "home", event.home.name));
    let awaySelection = selections.find((selection) => selectionMatches(selection, "away", event.away.name));
    if ((!homeSelection || !awaySelection) && selections.length === 2) [homeSelection, awaySelection] = selections;
    const home = asFloat(homeSelection?.price || homeSelection?.odds);
    const away = asFloat(awaySelection?.price || awaySelection?.odds);
    if (home && away) return { eventId: event.id, eventKey: event.key, eventName: event.name, homeName: event.home.name, awayName: event.away.name, home: home.toFixed(2), away: away.toFixed(2), marketKey, marketType: "match winner", marketUrlHome: `${marketKey}/home`, marketUrlAway: `${marketKey}/away` };
  }
  if (markets["tennis.winner_and_total"]) return syntheticOddsFromWinnerAndTotal(markets["tennis.winner_and_total"], event);
  return null;
}
function implied(odds) { const homeOdds = asFloat(odds?.home); const awayOdds = asFloat(odds?.away); if (!homeOdds || !awayOdds) return { home: 50, away: 50, edge: 0 }; const homeRaw = 1 / homeOdds; const awayRaw = 1 / awayOdds; const total = homeRaw + awayRaw; const home = Math.round((homeRaw / total) * 1000) / 10; const away = Math.round((awayRaw / total) * 1000) / 10; return { home, away, edge: Math.round((home - away) * 10) / 10 }; }
function profileFor(players, name, tour) { return players.find((player) => player.tour === tour && namesLookSimilar(player.name, name)) || null; }
function surfaceRating(profile, surface) { if (!profile) return 50; return asInt(profile[String(surface).toLowerCase()], profile.form || 50); }
function emptyRecentForm() { return { wins: 0, losses: 0, matches: 0, winRate: 50 }; }
async function storedRecentForm(env, tour, name) {
  if (!env.TENNIS_DB || !tour || !name) return emptyRecentForm();
  try {
    const row = await env.TENNIS_DB.prepare(`
      SELECT
        SUM(CASE WHEN prm.result = 'win' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN prm.result = 'loss' THEN 1 ELSE 0 END) AS losses,
        COUNT(*) AS matches
      FROM player_recent_matches prm
      JOIN players p ON p.id = prm.player_id
      WHERE p.tour = ? AND p.normalized_name = ? AND prm.match_date >= date('now', '-${RECENT_FORM_DAYS} days')
    `).bind(tour, normalizeName(name)).first();
    const wins = Number(row?.wins || 0);
    const losses = Number(row?.losses || 0);
    const matches = Number(row?.matches || wins + losses);
    return { wins, losses, matches, winRate: matches ? Math.round((wins / matches) * 1000) / 10 : 50 };
  } catch {
    return emptyRecentForm();
  }
}
async function enrichMatchesWithRecentForm(env, matches, diagnostics) {
  if (!env.TENNIS_DB || !matches.length) {
    diagnostics.recentFormSource = env.TENNIS_DB ? "empty" : "missing D1";
    diagnostics.recentFormPlayersFound = 0;
    return matches;
  }
  let found = 0;
  const enriched = [];
  for (const match of matches) {
    const [recentA, recentB] = await Promise.all([
      storedRecentForm(env, match.tour, match.playerA),
      storedRecentForm(env, match.tour, match.playerB),
    ]);
    if (recentA.matches) found += 1;
    if (recentB.matches) found += 1;
    const formA = recentA.matches ? recentA.winRate : 50;
    const formB = recentB.matches ? recentB.winRate : 50;
    enriched.push({
      ...match,
      formA,
      formB,
      recentA,
      recentB,
      returnEdge: Math.round((formA - formB) * 10) / 10,
    });
  }
  diagnostics.recentFormSource = "D1 player_recent_matches";
  diagnostics.recentFormPlayersFound = found;
  return enriched;
}
function makePrediction(event, odds, profileA, profileB) {
  const surface = inferSurface(event);
  const prob = implied(odds);
  const rankEdge = profileA?.rank && profileB?.rank ? clamp((profileB.rank - profileA.rank) * 0.18, -12, 12) : 0;
  const pointsEdge = profileA?.points && profileB?.points ? clamp(((profileA.points - profileB.points) / Math.max(profileA.points, profileB.points)) * 10, -6, 6) : 0;
  const surfaceEdge = (surfaceRating(profileA, surface) - surfaceRating(profileB, surface)) * 0.16;
  const marketEdge = prob.edge * 0.42;
  const modelEdge = marketEdge + rankEdge + pointsEdge + surfaceEdge + (isLive(event) ? 1.5 : 0);
  const side = modelEdge >= 0 ? "home" : "away";
  const winner = side === "home" ? event.home.name : event.away.name;
  const confidence = clamp(Math.round(54 + Math.abs(modelEdge) * 0.78 + (profileA && profileB ? 4 : 1)), 52, 86);
  return { predictedWinner: winner, predictedSide: side, predictedWinnerOdds: side === "home" ? odds.home : odds.away, confidence, modelEdge: Math.round(modelEdge * 10) / 10, factors: { marketProbability: prob, rankEdge: Math.round(rankEdge * 10) / 10, pointsEdge: Math.round(pointsEdge * 10) / 10, surfaceEdge: Math.round(surfaceEdge * 10) / 10, dataPoints: [odds.home, profileA?.rank && profileB?.rank, profileA?.points && profileB?.points].filter(Boolean).length } };
}
function normalizeMatch(event, odds, players, betUrl) {
  const tour = tourFromText(eventText(event));
  const profileA = profileFor(players, event.home.name, tour);
  const profileB = profileFor(players, event.away.name, tour);
  const prediction = makePrediction(event, odds, profileA, profileB);
  const startDate = event.startTime || event.cutoffTime || "";
  return { id: String(event.id || event.key), tournament: event.competition?.name || event.name || "Cloudbet Tennis", startTime: startDate ? new Date(startDate).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Available now", playerA: event.home.name, playerB: event.away.name, playerAKey: profileA?.playerKey || "", playerBKey: profileB?.playerKey || "", surface: inferSurface(event), market: `${prediction.predictedWinner} to Win`, formA: 50, formB: 50, recentA: emptyRecentForm(), recentB: emptyRecentForm(), rankA: profileA?.rank || null, rankB: profileB?.rank || null, pointsA: profileA?.points || 0, pointsB: profileB?.points || 0, serveHoldA: profileA?.hold || 75, serveHoldB: profileB?.hold || 75, returnEdge: 0, h2hEdge: 0, odds: prediction.predictedWinnerOdds, oddsSource: "Cloudbet", cloudbetOdds: odds, predictedWinner: prediction.predictedWinner, predictedSide: prediction.predictedSide, predictedWinnerOdds: prediction.predictedWinnerOdds, confidence: prediction.confidence, modelEdge: prediction.modelEdge, predictionFactors: prediction.factors, status: isLive(event) ? "Live" : "Scheduled", score: "", live: isLive(event), tour, doubles: isDoubles(event), betUrl };
}
async function getCloudbetMatches(env, players, betUrl, diagnostics) {
  const sport = await fetchCloudbet(env, "/sports/tennis");
  const competitions = (sport?.categories || [])
    .flatMap((category) => (category.competitions || []).map((competition) => ({ ...competition, category })))
    .filter((competition) => competition.eventCount > 0)
    .filter((competition) => !BLOCKED_RE.test(competitionText(competition)))
    .filter((competition) => /\b(atp|wta)\b/i.test(competitionText(competition)))
    .sort((a, b) => (/singles/i.test(competitionText(b)) ? 1 : 0) - (/singles/i.test(competitionText(a)) ? 1 : 0) || (b.eventCount || 0) - (a.eventCount || 0))
    .slice(0, 500);
  diagnostics.cloudbetSportEventCount = sport?.eventCount || 0;
  diagnostics.cloudbetScannedCompetitionCount = competitions.length;
  diagnostics.cloudbetCompetitionSamples = competitions.slice(0, 12).map(competitionText);
  const payloads = [];
  for (let i = 0; i < competitions.length; i += 25) {
    payloads.push(...await Promise.all(competitions.slice(i, i + 25).map(async (competition) => ({ competition, payload: await fetchCloudbet(env, `/competitions/${competition.key}`).catch(() => null) }))));
  }
  const rawEvents = payloads.flatMap(({ competition, payload }) => (payload?.events || []).map((event) => ({ ...event, competition: event.competition || competition })));
  diagnostics.cloudbetPayloadEventCount = rawEvents.length;
  const matches = rawEvents
    .filter((event) => !BLOCKED_RE.test(eventText(event)))
    .filter((event) => /\b(atp|wta)\b/i.test(eventText(event)))
    .filter(isUpcoming)
    .map((event) => ({ event, odds: extractOdds(event) }))
    .filter((item) => item.odds)
    .map(({ event, odds }) => normalizeMatch(event, odds, players, betUrl))
    .sort((a, b) => Number(b.live) - Number(a.live) || Number(a.doubles) - Number(b.doubles) || String(a.startTime).localeCompare(String(b.startTime)));
  diagnostics.cloudbetWinnerMarketCount = matches.length;
  diagnostics.singlesMatchCount = matches.filter((match) => !match.doubles).length;
  diagnostics.doublesMatchCount = matches.filter((match) => match.doubles).length;
  diagnostics.derivedWinnerAndTotalCount = matches.filter((match) => match.cloudbetOdds.marketKey === "tennis.winner_and_total").length;
  return enrichMatchesWithRecentForm(env, matches, diagnostics);
}

function rssTag(item, tag) { return cleanText(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i"))?.[1] || ""); }
function rssImage(item) { return item.match(/<media:content[^>]+url=["']([^"']+)/i)?.[1] || item.match(/<enclosure[^>]+url=["']([^"']+)/i)?.[1] || DEFAULT_NEWS_IMAGE; }
async function getNews() {
  const response = await fetch(TENNIS_RSS, { headers: { accept: "application/rss+xml, application/xml, text/xml" } });
  if (!response.ok) throw new Error(`Tennis.com returned ${response.status}`);
  return [...(await response.text()).matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 16).map((match, index) => {
    const item = match[0];
    const title = rssTag(item, "title");
    const url = rssTag(item, "link") || rssTag(item, "guid") || "#";
    const published = new Date(rssTag(item, "pubDate"));
    return { id: url || `news-${index}`, title, category: /rank|stat/i.test(title) ? "Trend" : /open|masters|draw|schedule/i.test(title) ? "Tournament" : "News", time: Number.isNaN(published.getTime()) ? "Latest" : published.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), summary: rssTag(item, "description") || "Read the latest tennis update.", url, imageUrl: rssImage(item), source: "Tennis.com" };
  });
}

export async function onRequestGet({ env }) {
  const betUrl = (env.CLOUDBET_AFFILIATE_URL || DEFAULT_BET_URL).trim();
  const errors = [];
  const diagnostics = { hasApiTennisKey: Boolean(env.API_TENNIS_KEY), hasCloudbetApiKey: Boolean(env.CLOUDBET_API_KEY), hasCloudbetAffiliateUrl: Boolean(env.CLOUDBET_AFFILIATE_URL), hasPlayerCache: Boolean(getPlayerCache(env)), hasD1: Boolean(env.TENNIS_DB), predictionSource: "Cloudbet ATP/WTA match markets. Direct tennis.winner when available; derived winner side from tennis.winner_and_total when direct winner is absent.", playerStats: "Top 500 ATP + Top 500 WTA", newsProvider: "Tennis.com RSS" };
  let players = [];
  let matches = [];
  let news = [];
  try { players = await getPlayers(env); } catch (error) { errors.push(`player stats: ${error.message}`); }
  try { matches = await getCloudbetMatches(env, players, betUrl, diagnostics); } catch (error) { errors.push(`cloudbet predictions: ${error.message}`); }
  try { news = await getNews(); } catch (error) { errors.push(`news: ${error.message}`); }
  diagnostics.playerCount = players.length;
  diagnostics.matchCount = matches.length;
  diagnostics.liveMatchCount = matches.filter((match) => match.live).length;
  diagnostics.upcomingMatchCount = matches.filter((match) => !match.live).length;
  diagnostics.newsCount = news.length;
  diagnostics.newsWithImagesCount = news.filter((article) => article.imageUrl).length;
  return json({ generatedAt: new Date().toISOString(), source: { tennis: players.length ? "API-Tennis" : "fallback", odds: env.CLOUDBET_API_KEY && !errors.some((error) => error.startsWith("cloudbet")) ? "Cloudbet" : "fallback", news: news.length ? "Tennis.com" : "fallback" }, betUrl, matches, players: players.length ? players : fallbackPlayers, news: news.length ? news : fallbackNews, errors, diagnostics });
}
