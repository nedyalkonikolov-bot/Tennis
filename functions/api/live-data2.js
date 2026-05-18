const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const CLOUDBET_API_BASE = "https://sports-api.cloudbet.com/pub/v2/odds";
const NEWS_FEEDS = [
  { name: "ESPN", url: "https://www.espn.com/espn/rss/tennis/news" },
  { name: "TennisHead", url: "https://r.jina.ai/http://https://tennishead.net/feed", type: "jinaMarkdown" },
];
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_BET_URL = "https://www.cloudbet.com/en/sports/tennis";
const DEFAULT_NEWS_IMAGE = "https://images.tennis.com/image/upload/t_q-best/tenniscom-prd/colectyfnidvc41bazww.jpg";
const PLAYER_CACHE_KEY = "players:standings:v1";
const PLAYER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PLAYER_LIMIT = 500;
const AI_CACHE_TTL_SECONDS = 30 * 60;
const AI_NEWS_CACHE_TTL_SECONDS = 60 * 60;
const CLOUDBET_MARKETS_QUERY = "?markets=tennis.winner&markets=tennis.winner_and_total";
const RECENT_FORM_DAYS = 100;
const BLOCKED_RE = /\b(simulated|simulation|virtual|srl|reality league|itf|utr|exhibition|junior|boys|girls|college|davis|billie|hopman)\b/i;

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
function safeText(value = "") { return String(value || "").trim(); }
function getOpenAiModel(env) { return env.OPENAI_MODEL || "gpt-4o-mini"; }
function hasOpenAi(env) { return Boolean(env.OPENAI_API_KEY) && env.ENABLE_OPENAI_AI !== "false"; }
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
function inferSurface(event = {}) {
  const text = eventText(event).toLowerCase();
  if (/\b(wimbledon|halle|queen'?s|stuttgart|mallorca|s-hertogenbosch|nottingham|eastbourne|bad homburg|berlin)\b/.test(text)) return "Grass";
  if (/\b(roland|french open|rome|madrid|monte carlo|barcelona|munich|hamburg|geneva|strasbourg|rabat|parma|bordeaux|tunis|valencia|cordoba|oeiras|zagreb|paris, france|wta 125k paris)\b/.test(text)) return "Clay";
  if (/\b(bengaluru|australian open|indian wells|miami|cincinnati|canada|toronto|montreal|us open|doha|dubai|tokyo|beijing|shanghai|vienna|basel|stockholm|rotterdam|acapulco|delray|washington|atlanta|brisbane|adelaide|auckland|singapore|hong kong)\b/.test(text)) return "Hard";
  return "Hard";
}
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
  const home = 1 / homeRaw;
  const away = 1 / awayRaw;
  if (home < 1.01 || away < 1.01) return null;
  return { home: home.toFixed(2), away: away.toFixed(2), marketKey: "tennis.winner_and_total", marketType: "derived winner side from winner_and_total", marketUrlHome: "tennis.winner_and_total/home", marketUrlAway: "tennis.winner_and_total/away", eventId: event.id, eventKey: event.key, eventName: event.name, homeName: event.home.name, awayName: event.away.name };
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
    if (home >= 1.01 && away >= 1.01) return { eventId: event.id, eventKey: event.key, eventName: event.name, homeName: event.home.name, awayName: event.away.name, home: home.toFixed(2), away: away.toFixed(2), marketKey, marketType: "match winner", marketUrlHome: `${marketKey}/home`, marketUrlAway: `${marketKey}/away` };
  }
  if (markets["tennis.winner_and_total"]) return syntheticOddsFromWinnerAndTotal(markets["tennis.winner_and_total"], event);
  return null;
}
function implied(odds) { const homeOdds = asFloat(odds?.home); const awayOdds = asFloat(odds?.away); if (!homeOdds || !awayOdds) return { home: 50, away: 50, edge: 0 }; const homeRaw = 1 / homeOdds; const awayRaw = 1 / awayOdds; const total = homeRaw + awayRaw; const home = Math.round((homeRaw / total) * 1000) / 10; const away = Math.round((awayRaw / total) * 1000) / 10; return { home, away, edge: Math.round((home - away) * 10) / 10 }; }
function profileFor(players, name, tour) { return players.find((player) => player.tour === tour && namesLookSimilar(player.name, name)) || null; }
function surfaceRating(profile, surface) { if (!profile) return 50; return asInt(profile[String(surface).toLowerCase()], profile.form || 50); }
function emptyRecentForm() { return { wins: 0, losses: 0, matches: 0, winRate: 50 }; }
async function callOpenAiJson(env, name, schema, input, maxOutputTokens = 1200) {
  if (!hasOpenAi(env)) return null;
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAiModel(env),
      input,
      text: {
        format: {
          type: "json_schema",
          name,
          strict: true,
          schema,
        },
      },
      max_output_tokens: maxOutputTokens,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned ${response.status}`);
  const text = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((part) => part.type === "output_text")?.text;
  return text ? JSON.parse(text) : null;
}

function aiPredictionInput(match) {
  return {
    id: String(match.id),
    tour: match.tour,
    tournament: match.tournament,
    status: match.status,
    live: Boolean(match.live),
    surface: match.surface,
    players: [
      { side: "home", name: match.playerA, rank: match.rankA, points: match.pointsA, recent: match.recentA, form: match.formA, surfaceRating: surfaceRating({ clay: match.surface === "Clay" ? match.formA : 50, hard: match.surface === "Hard" ? match.formA : 50, grass: match.surface === "Grass" ? match.formA : 50, form: match.formA }, match.surface) },
      { side: "away", name: match.playerB, rank: match.rankB, points: match.pointsB, recent: match.recentB, form: match.formB, surfaceRating: surfaceRating({ clay: match.surface === "Clay" ? match.formB : 50, hard: match.surface === "Hard" ? match.formB : 50, grass: match.surface === "Grass" ? match.formB : 50, form: match.formB }, match.surface) },
    ],
    odds: match.cloudbetOdds,
    deterministicPick: {
      winner: match.predictedWinner,
      side: match.predictedSide,
      odds: match.predictedWinnerOdds,
      confidence: match.confidence,
      edge: match.modelEdge,
      factors: match.predictionFactors,
    },
  };
}

function applyAiPrediction(match, ai) {
  if (!ai || String(ai.id) !== String(match.id)) return match;
  const side = ai.predictedSide === "away" ? "away" : "home";
  const winner = side === "home" ? match.playerA : match.playerB;
  const odds = side === "home" ? match.cloudbetOdds?.home : match.cloudbetOdds?.away;
  return {
    ...match,
    predictedWinner: winner,
    predictedSide: side,
    predictedWinnerOdds: odds || match.predictedWinnerOdds,
    odds: odds || match.odds,
    confidence: clamp(asInt(ai.confidence, match.confidence), 51, 88),
    modelEdge: asFloat(ai.modelEdge, match.modelEdge),
    market: `${winner} to Win`,
    aiSummary: safeText(ai.summary),
    aiReasons: Array.isArray(ai.reasons) ? ai.reasons.slice(0, 4).map(safeText).filter(Boolean) : [],
    aiBettingAngle: safeText(ai.bettingAngle),
    predictionFactors: {
      ...(match.predictionFactors || {}),
      aiSummary: safeText(ai.summary),
      aiReasons: Array.isArray(ai.reasons) ? ai.reasons.slice(0, 4).map(safeText).filter(Boolean) : [],
      aiBettingAngle: safeText(ai.bettingAngle),
      openai: { generatedAt: new Date().toISOString(), previousPick: match.predictedWinner },
    },
  };
}

async function enhancePredictionsWithOpenAi(env, matches, diagnostics) {
  if (!hasOpenAi(env) || !matches.length) {
    diagnostics.openAiPredictions = hasOpenAi(env) ? "no matches" : "disabled";
    return matches;
  }
  const cache = getPlayerCache(env);
  const limit = Math.min(Math.max(asInt(env.OPENAI_PREDICTION_LIMIT, 12), 1), 25);
  const target = matches.slice(0, limit);
  const cacheKey = `ai:predictions:v1:${target.map((match) => match.id).join(":")}`;
  const cached = cache ? await cache.get(cacheKey, "json").catch(() => null) : null;
  if (cached?.predictions?.length) {
    diagnostics.openAiPredictions = "cached";
    diagnostics.openAiPredictionCount = cached.predictions.length;
    const byId = new Map(cached.predictions.map((item) => [String(item.id), item]));
    return matches.map((match) => byId.has(String(match.id)) ? applyAiPrediction(match, byId.get(String(match.id))) : match);
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      predictions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            predictedSide: { type: "string", enum: ["home", "away"] },
            confidence: { type: "integer", minimum: 51, maximum: 88 },
            modelEdge: { type: "number" },
            summary: { type: "string" },
            reasons: { type: "array", items: { type: "string" } },
            bettingAngle: { type: "string" },
          },
          required: ["id", "predictedSide", "confidence", "modelEdge", "summary", "reasons", "bettingAngle"],
        },
      },
    },
    required: ["predictions"],
  };
  const result = await callOpenAiJson(env, "tennis_predictions", schema, [
    { role: "system", content: "You are TennisTipz AI. Generate tennis match winner predictions from supplied current data only. Do not invent injuries, scores, private information, or guaranteed outcomes. Use cautious betting language and include risk context. Return JSON only." },
    { role: "user", content: JSON.stringify({ generatedAt: new Date().toISOString(), matches: target.map(aiPredictionInput) }) },
  ], 2200);
  const predictions = result?.predictions || [];
  if (cache && predictions.length) await cache.put(cacheKey, JSON.stringify({ generatedAt: new Date().toISOString(), predictions }), { expirationTtl: AI_CACHE_TTL_SECONDS }).catch(() => null);
  diagnostics.openAiPredictions = predictions.length ? "success" : "empty";
  diagnostics.openAiModel = getOpenAiModel(env);
  diagnostics.openAiPredictionCount = predictions.length;
  const byId = new Map(predictions.map((item) => [String(item.id), item]));
  return matches.map((match) => byId.has(String(match.id)) ? applyAiPrediction(match, byId.get(String(match.id))) : match);
}

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
function toIsoDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}
function normalizeMatch(event, odds, players, betUrl) {
  const tour = tourFromText(eventText(event));
  const profileA = profileFor(players, event.home.name, tour);
  const profileB = profileFor(players, event.away.name, tour);
  const prediction = makePrediction(event, odds, profileA, profileB);
  const startDate = event.startTime || event.cutoffTime || "";
  const startIso = toIsoDate(startDate);
  return { id: String(event.id || event.key), tournament: event.competition?.name || event.name || "Cloudbet Tennis", startTime: startIso ? new Date(startIso).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Available now", startIso, playerA: event.home.name, playerB: event.away.name, playerAKey: profileA?.playerKey || "", playerBKey: profileB?.playerKey || "", surface: inferSurface(event), market: `${prediction.predictedWinner} to Win`, formA: 50, formB: 50, recentA: emptyRecentForm(), recentB: emptyRecentForm(), rankA: profileA?.rank || null, rankB: profileB?.rank || null, pointsA: profileA?.points || 0, pointsB: profileB?.points || 0, serveHoldA: profileA?.hold || 75, serveHoldB: profileB?.hold || 75, returnEdge: 0, h2hEdge: 0, odds: prediction.predictedWinnerOdds, oddsSource: "Cloudbet", cloudbetOdds: odds, predictedWinner: prediction.predictedWinner, predictedSide: prediction.predictedSide, predictedWinnerOdds: prediction.predictedWinnerOdds, confidence: prediction.confidence, modelEdge: prediction.modelEdge, predictionFactors: prediction.factors, status: isLive(event) ? "Live" : "Scheduled", score: "", live: isLive(event), tour, doubles: isDoubles(event), betUrl };
}
async function getCloudbetMatches(env, players, betUrl, diagnostics) {
  const sport = await fetchCloudbet(env, "/sports/tennis");
  const allCompetitions = (sport?.categories || [])
    .flatMap((category) => (category.competitions || []).map((competition) => ({ ...competition, category })))
    .filter((competition) => competition.eventCount > 0);
  const rejectedCompetitions = allCompetitions.filter((competition) => BLOCKED_RE.test(competitionText(competition)));
  const competitions = allCompetitions
    .filter((competition) => !BLOCKED_RE.test(competitionText(competition)))
    .filter((competition) => /\b(atp|wta)\b/i.test(competitionText(competition)))
    .sort((a, b) => (/singles/i.test(competitionText(b)) ? 1 : 0) - (/singles/i.test(competitionText(a)) ? 1 : 0) || (b.eventCount || 0) - (a.eventCount || 0))
    .slice(0, 500);
  diagnostics.cloudbetSportEventCount = sport?.eventCount || 0;
  diagnostics.cloudbetScannedCompetitionCount = competitions.length;
  diagnostics.cloudbetRejectedCompetitionCount = rejectedCompetitions.length;
  diagnostics.cloudbetRejectedCompetitionSamples = rejectedCompetitions.slice(0, 12).map(competitionText);
  diagnostics.cloudbetCompetitionSamples = competitions.slice(0, 12).map(competitionText);
  const payloads = [];
  for (let i = 0; i < competitions.length; i += 25) {
    payloads.push(...await Promise.all(competitions.slice(i, i + 25).map(async (competition) => ({ competition, payload: await fetchCloudbet(env, `/competitions/${competition.key}${CLOUDBET_MARKETS_QUERY}`).catch(() => fetchCloudbet(env, `/competitions/${competition.key}`).catch(() => null)) }))));
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

function dbSlug(value = "") { return normalizeName(value).replace(/\s+/g, "-") || "unknown"; }
function makeDbPlayerId(tour, name) { return `${tour.toLowerCase()}:${dbSlug(name)}`; }
function makeDbMatchId(source, sourceEventId) { return `${source}:${String(sourceEventId || "unknown")}`; }
function makeDbPredictionId(matchId) { return `${matchId}:v1`; }
async function ensureDbMatchPlayer(db, name, tour, playerKey = "") {
  const normalized = normalizeName(name);
  const found = await db.prepare("SELECT id FROM players WHERE tour = ? AND normalized_name = ? LIMIT 1").bind(tour, normalized).first();
  if (found?.id) {
    if (playerKey) await db.prepare("UPDATE players SET player_key = COALESCE(NULLIF(player_key, ''), ?), updated_at = datetime('now') WHERE id = ?").bind(String(playerKey), found.id).run();
    return found.id;
  }
  const id = playerKey ? `${tour.toLowerCase()}:${playerKey}` : makeDbPlayerId(tour, name);
  await db.prepare(`
    INSERT INTO players (id, player_key, name, normalized_name, tour, source, updated_at)
    VALUES (?, ?, ?, ?, ?, 'live-prediction-sync', datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      player_key = COALESCE(NULLIF(excluded.player_key, ''), player_key),
      name = excluded.name,
      normalized_name = excluded.normalized_name,
      updated_at = datetime('now')
  `).bind(id, safeText(playerKey), safeText(name), normalized, tour).run();
  return id;
}
async function upsertLivePrediction(db, match) {
  const tour = match.tour === "WTA" ? "WTA" : "ATP";
  const source = match.oddsSource === "Cloudbet" ? "cloudbet" : "live-data";
  const matchId = makeDbMatchId(source, match.id);
  const playerAId = await ensureDbMatchPlayer(db, match.playerA, tour, match.playerAKey);
  const playerBId = await ensureDbMatchPlayer(db, match.playerB, tour, match.playerBKey);
  await db.prepare(`
    INSERT INTO matches (
      id, source, source_event_id, tour, tournament, start_time, status, live, surface,
      player_a_id, player_b_id, player_a_name, player_b_name, normalized_player_a, normalized_player_b,
      score, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(source, source_event_id) DO UPDATE SET
      tour = excluded.tour,
      tournament = excluded.tournament,
      start_time = excluded.start_time,
      status = excluded.status,
      live = excluded.live,
      surface = excluded.surface,
      player_a_id = excluded.player_a_id,
      player_b_id = excluded.player_b_id,
      player_a_name = excluded.player_a_name,
      player_b_name = excluded.player_b_name,
      normalized_player_a = excluded.normalized_player_a,
      normalized_player_b = excluded.normalized_player_b,
      score = excluded.score,
      updated_at = datetime('now')
  `).bind(
    matchId,
    source,
    String(match.id),
    tour,
    safeText(match.tournament),
    safeText(match.startIso || match.startTime),
    match.status || (match.live ? "Live" : "Scheduled"),
    match.live ? 1 : 0,
    safeText(match.surface),
    playerAId,
    playerBId,
    safeText(match.playerA),
    safeText(match.playerB),
    normalizeName(match.playerA),
    normalizeName(match.playerB),
    safeText(match.score)
  ).run();
  const predictedWinnerName = match.predictedWinner || match.market || "Value watch";
  const predictedWinnerId = normalizeName(predictedWinnerName) === normalizeName(match.playerA) ? playerAId : normalizeName(predictedWinnerName) === normalizeName(match.playerB) ? playerBId : null;
  const predictionId = makeDbPredictionId(matchId);
  await db.prepare(`
    INSERT INTO predictions (
      id, match_id, model_version, source, predicted_winner_id, predicted_winner_name,
      predicted_side, confidence, predicted_odds, model_edge, factors_json
    ) VALUES (?, ?, 'v1', 'tennistipz-live', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id, model_version) DO UPDATE SET
      predicted_winner_id = excluded.predicted_winner_id,
      predicted_winner_name = excluded.predicted_winner_name,
      predicted_side = excluded.predicted_side,
      confidence = excluded.confidence,
      predicted_odds = excluded.predicted_odds,
      model_edge = excluded.model_edge,
      factors_json = excluded.factors_json
  `).bind(
    predictionId,
    matchId,
    predictedWinnerId,
    safeText(predictedWinnerName),
    safeText(match.predictedSide),
    asInt(match.confidence, 0),
    safeText(match.predictedWinnerOdds || match.odds),
    match.modelEdge === undefined ? null : Number(match.modelEdge),
    JSON.stringify(match.predictionFactors || {})
  ).run();
  await db.prepare(`
    INSERT INTO prediction_outcomes (prediction_id, match_id, result_status)
    VALUES (?, ?, 'pending')
    ON CONFLICT(prediction_id) DO NOTHING
  `).bind(predictionId, matchId).run();
  return { matchId, predictionId };
}
async function syncLivePredictionsToDb(env, matches, diagnostics) {
  if (!env.TENNIS_DB || !matches.length) {
    diagnostics.dbPredictionSync = env.TENNIS_DB ? "no matches" : "missing D1";
    diagnostics.dbPredictionsUpserted = 0;
    return;
  }
  let upserted = 0;
  const errors = [];
  for (const match of matches) {
    if (!match?.id || !match.playerA || !match.playerB || !["ATP", "WTA"].includes(match.tour)) continue;
    try {
      await upsertLivePrediction(env.TENNIS_DB, match);
      upserted += 1;
    } catch (error) {
      errors.push(`${match.id}: ${error.message}`);
    }
  }
  diagnostics.dbPredictionSync = errors.length ? "partial" : "success";
  diagnostics.dbPredictionsUpserted = upserted;
  if (errors.length) diagnostics.dbPredictionSyncErrors = errors.slice(0, 5);
}
function rssTag(item, tag) { return cleanText(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i"))?.[1] || ""); }
function rssImage(item) { return item.match(/<media:content[^>]+url=["']([^"']+)/i)?.[1] || item.match(/<enclosure[^>]+url=["']([^"']+)/i)?.[1] || DEFAULT_NEWS_IMAGE; }
function newsCategory(title) { return /rank|stat/i.test(title) ? "Trend" : /open|masters|draw|schedule|garros|wimbledon|slam/i.test(title) ? "Tournament" : /injur|withdraw|fitness|return/i.test(title) ? "Player News" : "News"; }
function formatNewsTime(date) { return Number.isNaN(date.getTime()) ? "Latest" : date.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function parseJinaMarkdownNews(text, feed) {
  return [...text.matchAll(/### \[([^\]]+)\]\((https?:\/\/[^\s)]+)\)[\s\S]*?\n([A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} [^\n]+)/g)]
    .slice(0, 16)
    .map((match, index) => {
      const title = cleanText(match[1]);
      const url = match[2];
      const published = new Date(match[3]);
      return { id: url || `${feed.name}-${index}`, title, category: newsCategory(title), time: formatNewsTime(published), publishedAt: Number.isNaN(published.getTime()) ? "" : published.toISOString(), summary: "Read the latest TennisHead update.", url, imageUrl: DEFAULT_NEWS_IMAGE, source: feed.name };
    });
}
async function getNewsFromFeed(feed) {
  const response = await fetch(feed.url, { headers: { accept: feed.type === "jinaMarkdown" ? "text/plain, text/markdown" : "application/rss+xml, application/xml, text/xml" } });
  if (!response.ok) throw new Error(`${feed.name} returned ${response.status}`);
  const text = await response.text();
  if (feed.type === "jinaMarkdown") return parseJinaMarkdownNews(text, feed);
  return [...text.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 16).map((match, index) => {
    const item = match[0];
    const title = rssTag(item, "title");
    const url = rssTag(item, "link") || rssTag(item, "guid") || "#";
    const published = new Date(rssTag(item, "pubDate"));
    return { id: url || `${feed.name}-${index}`, title, category: newsCategory(title), time: formatNewsTime(published), publishedAt: Number.isNaN(published.getTime()) ? "" : published.toISOString(), summary: rssTag(item, "description") || "Read the latest tennis update.", url, imageUrl: rssImage(item), source: feed.name };
  });
}

async function getNews() {
  const settled = await Promise.allSettled(NEWS_FEEDS.map(getNewsFromFeed));
  const news = settled.flatMap((item) => item.status === "fulfilled" ? item.value : []);
  const seen = new Set();
  return news
    .filter((item) => item.title && item.url && !seen.has(item.url) && seen.add(item.url))
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, 16);
}

async function enhanceNewsWithOpenAi(env, news, diagnostics) {
  if (!hasOpenAi(env) || !news.length) {
    diagnostics.openAiNews = hasOpenAi(env) ? "no news" : "disabled";
    return news;
  }
  const cache = getPlayerCache(env);
  const cacheKey = `ai:news:espn-tennishead:v2:${news.slice(0, 8).map((item) => item.id).join("|").slice(0, 700)}`;
  const cached = cache ? await cache.get(cacheKey, "json").catch(() => null) : null;
  if (cached?.news?.length) {
    diagnostics.openAiNews = "cached";
    return cached.news;
  }
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      news: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            category: { type: "string", enum: ["News", "Tournament", "Player News", "Market", "Trend"] },
            summary: { type: "string" },
            bettingAngle: { type: "string" },
          },
          required: ["id", "title", "category", "summary", "bettingAngle"],
        },
      },
    },
    required: ["news"],
  };
  const result = await callOpenAiJson(env, "tennis_news", schema, [
    { role: "system", content: "You are TennisTipz AI. Rewrite the supplied ESPN and TennisHead tennis RSS headlines into original, concise betting-research news cards. Use only supplied facts. Do not copy article wording. Do not invent injuries, rumors, or match results. Return JSON only." },
    { role: "user", content: JSON.stringify({ generatedAt: new Date().toISOString(), articles: news.slice(0, 8).map(({ id, title, summary, url, source }) => ({ id, title, summary, url, source })) }) },
  ], 1800);
  const byId = new Map((result?.news || []).map((item) => [String(item.id), item]));
  const enhanced = news.map((item) => {
    const ai = byId.get(String(item.id));
    if (!ai) return item;
    return {
      ...item,
      title: safeText(ai.title) || item.title,
      category: safeText(ai.category) || item.category,
      summary: safeText(ai.summary) || item.summary,
      bettingAngle: safeText(ai.bettingAngle),
      source: `TennisTipz AI + ${item.source || "ESPN/TennisHead"}`,
    };
  });
  if (cache && enhanced.length) await cache.put(cacheKey, JSON.stringify({ generatedAt: new Date().toISOString(), news: enhanced }), { expirationTtl: AI_NEWS_CACHE_TTL_SECONDS }).catch(() => null);
  diagnostics.openAiNews = "success";
  diagnostics.openAiNewsCount = byId.size;
  return enhanced;
}

export async function onRequestGet({ env }) {
  const betUrl = (env.CLOUDBET_AFFILIATE_URL || DEFAULT_BET_URL).trim();
  const errors = [];
  const diagnostics = { hasApiTennisKey: Boolean(env.API_TENNIS_KEY), hasCloudbetApiKey: Boolean(env.CLOUDBET_API_KEY), hasCloudbetAffiliateUrl: Boolean(env.CLOUDBET_AFFILIATE_URL), hasOpenAiKey: Boolean(env.OPENAI_API_KEY), openAiModel: getOpenAiModel(env), hasPlayerCache: Boolean(getPlayerCache(env)), hasD1: Boolean(env.TENNIS_DB), predictionSource: hasOpenAi(env) ? "OpenAI structured prediction layer using Cloudbet odds, API-Tennis/player DB form, rankings and surface data" : "Cloudbet ATP/WTA match markets. Direct tennis.winner when available; derived winner side from tennis.winner_and_total when direct winner is absent.", playerStats: "Top 500 ATP + Top 500 WTA", newsProvider: hasOpenAi(env) ? "OpenAI summaries from ESPN + TennisHead RSS" : "ESPN + TennisHead RSS" };
  let players = [];
  let matches = [];
  let news = [];
  try { players = await getPlayers(env); } catch (error) { errors.push(`player stats: ${error.message}`); }
  try { matches = await getCloudbetMatches(env, players, betUrl, diagnostics); } catch (error) { errors.push(`cloudbet predictions: ${error.message}`); }
  try { matches = await enhancePredictionsWithOpenAi(env, matches, diagnostics); } catch (error) { errors.push(`openai predictions: ${error.message}`); diagnostics.openAiPredictions = "error"; }
  try { news = await getNews(); } catch (error) { errors.push(`news: ${error.message}`); }
  try { news = await enhanceNewsWithOpenAi(env, news, diagnostics); } catch (error) { errors.push(`openai news: ${error.message}`); diagnostics.openAiNews = "error"; }
  try { await syncLivePredictionsToDb(env, matches, diagnostics); } catch (error) { errors.push(`db prediction sync: ${error.message}`); diagnostics.dbPredictionSync = "error"; }
  diagnostics.playerCount = players.length;
  diagnostics.matchCount = matches.length;
  diagnostics.liveMatchCount = matches.filter((match) => match.live).length;
  diagnostics.upcomingMatchCount = matches.filter((match) => !match.live).length;
  diagnostics.newsCount = news.length;
  diagnostics.newsWithImagesCount = news.filter((article) => article.imageUrl).length;
  return json({ generatedAt: new Date().toISOString(), source: { tennis: players.length ? "API-Tennis" : "fallback", odds: env.CLOUDBET_API_KEY && !errors.some((error) => error.startsWith("cloudbet")) ? "Cloudbet" : "fallback", news: news.length ? (diagnostics.openAiNews === "success" || diagnostics.openAiNews === "cached" ? "OpenAI + ESPN/TennisHead" : "ESPN/TennisHead") : "fallback" }, betUrl, matches, players: players.length ? players : fallbackPlayers, news: news.length ? news : fallbackNews, errors, diagnostics });
}
