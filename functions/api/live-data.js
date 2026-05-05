const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const NEWS_API_BASE = "https://newsapi.org/v2/everything";

const fallbackMatches = [
  {
    id: "demo-1",
    tournament: "Madrid Masters",
    startTime: "Today 14:30",
    playerA: "Jannik Sinner",
    playerB: "Carlos Alcaraz",
    surface: "Clay",
    market: "Over 22.5 Games",
    formA: 88,
    formB: 84,
    serveHoldA: 91,
    serveHoldB: 88,
    returnEdge: 3,
    h2hEdge: -2,
    odds: "1.86",
    status: "Scheduled",
    live: false,
  },
];

const fallbackPlayers = [
  { id: "demo-player-1", name: "Jannik Sinner", tour: "ATP", rank: 1, form: 88, hold: 91, breakRate: 28, clay: 84, hard: 92, grass: 79, trend: "+6" },
  { id: "demo-player-2", name: "Carlos Alcaraz", tour: "ATP", rank: 2, form: 84, hold: 88, breakRate: 31, clay: 91, hard: 86, grass: 83, trend: "+3" },
  { id: "demo-player-3", name: "Iga Swiatek", tour: "WTA", rank: 1, form: 92, hold: 82, breakRate: 46, clay: 96, hard: 88, grass: 73, trend: "+8" },
];

const fallbackNews = [
  {
    id: "demo-news-1",
    title: "Live tennis feed is waiting for API keys",
    category: "Setup",
    time: "Now",
    summary: "Add API_TENNIS_KEY and NEWS_API_KEY in Cloudflare Pages secrets to replace demo content with live data.",
    url: "#",
    source: "TennisTipz",
  },
];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function asNumber(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function inferSurface(event) {
  const text = `${event.tournament_name || ""} ${event.event_type_type || ""}`.toLowerCase();

  if (text.includes("grass") || text.includes("queens") || text.includes("halle") || text.includes("wimbledon")) return "Grass";
  if (text.includes("clay") || text.includes("roland") || text.includes("madrid") || text.includes("rome") || text.includes("monte")) return "Clay";
  return "Hard";
}

function inferTour(value = "") {
  const text = value.toLowerCase();
  if (text.includes("wta") || text.includes("women")) return "WTA";
  return "ATP";
}

function normalizeFixture(event) {
  const playerA = event.event_first_player || "Player A";
  const playerB = event.event_second_player || "Player B";
  const isLive = event.event_live === "1" || event.event_status?.toLowerCase?.().includes("set");

  return {
    id: String(event.event_key || `${playerA}-${playerB}-${event.event_date}`),
    tournament: event.tournament_name || event.event_type_type || "Tennis",
    startTime: `${event.event_date || "Today"} ${event.event_time || ""}`.trim(),
    playerA,
    playerB,
    surface: inferSurface(event),
    market: isLive ? "Live value watch" : `${playerA} to Win`,
    formA: 60 + (asNumber(event.first_player_key, 1) % 35),
    formB: 60 + (asNumber(event.second_player_key, 2) % 35),
    serveHoldA: 68 + (asNumber(event.first_player_key, 3) % 24),
    serveHoldB: 68 + (asNumber(event.second_player_key, 4) % 24),
    returnEdge: (asNumber(event.first_player_key, 1) % 11) - (asNumber(event.second_player_key, 2) % 11),
    h2hEdge: 0,
    odds: "Live",
    status: event.event_status || "Scheduled",
    score: event.event_final_result || event.event_game_result || "",
    live: isLive,
    tour: inferTour(event.event_type_type),
  };
}

function normalizePlayer(player, tour) {
  const rank = asNumber(player.place || player.player_place || player.rank || player.standing_place, 999);
  const name = player.player || player.player_name || player.name || "Unknown player";
  const seed = rank === 999 ? name.length : rank;

  return {
    id: String(player.player_key || player.player_id || `${tour}-${name}`),
    name,
    tour,
    rank,
    form: Math.max(52, 96 - Math.min(seed, 44)),
    hold: 65 + (seed % 28),
    breakRate: 18 + (seed % 24),
    clay: 62 + ((seed + 9) % 32),
    hard: 62 + ((seed + 17) % 32),
    grass: 58 + ((seed + 23) % 30),
    trend: seed % 3 === 0 ? "+3" : seed % 3 === 1 ? "+1" : "-1",
  };
}

function normalizeArticle(article, index) {
  const published = article.publishedAt ? new Date(article.publishedAt) : null;
  const time = published && !Number.isNaN(published.getTime()) ? published.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Latest";

  return {
    id: article.url || `news-${index}`,
    title: article.title || "Tennis update",
    category: article.title?.toLowerCase?.().includes("injur") ? "Player News" : "News",
    time,
    summary: article.description || article.content || "Read the latest tennis update.",
    url: article.url || "#",
    source: article.source?.name || "NewsAPI",
  };
}

async function fetchApiTennis(env, method, params = {}) {
  if (!env.API_TENNIS_KEY) return null;

  const url = new URL(TENNIS_API_BASE);
  url.searchParams.set("method", method);
  url.searchParams.set("APIkey", env.API_TENNIS_KEY);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });

  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${method} returned ${response.status}`);

  const payload = await response.json();
  if (payload.success === 0) throw new Error(payload.error || `${method} returned no success flag`);
  return Array.isArray(payload.result) ? payload.result : [];
}

async function getMatches(env) {
  const today = new Date();
  const date_start = formatDate(today);
  const date_stop = formatDate(addDays(today, 2));

  const [liveScores, fixtures] = await Promise.all([
    fetchApiTennis(env, "get_livescore", { timezone: "Europe/Sofia" }),
    fetchApiTennis(env, "get_fixtures", { date_start, date_stop, timezone: "Europe/Sofia" }),
  ]);

  const events = [...(liveScores || []), ...(fixtures || [])];
  const uniqueEvents = Array.from(new Map(events.map((event) => [event.event_key || JSON.stringify(event), event])).values());

  return uniqueEvents.slice(0, 12).map(normalizeFixture);
}

async function getPlayers(env) {
  if (!env.API_TENNIS_KEY) return [];

  const [atp, wta] = await Promise.all([
    fetchApiTennis(env, "get_standings", { event_type: "ATP" }).catch(() => []),
    fetchApiTennis(env, "get_standings", { event_type: "WTA" }).catch(() => []),
  ]);

  return [
    ...(atp || []).slice(0, 12).map((player) => normalizePlayer(player, "ATP")),
    ...(wta || []).slice(0, 12).map((player) => normalizePlayer(player, "WTA")),
  ];
}

async function getNews(env) {
  if (!env.NEWS_API_KEY) return [];

  const url = new URL(NEWS_API_BASE);
  url.searchParams.set("q", "tennis");
  url.searchParams.set("searchIn", "title,description");
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", "12");
  url.searchParams.set("apiKey", env.NEWS_API_KEY);

  const response = await fetch(url, { headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) throw new Error(payload.message || `NewsAPI returned ${response.status}`);
  if (payload.status === "error") throw new Error(payload.message || "NewsAPI returned an error");

  return (payload.articles || []).slice(0, 12).map(normalizeArticle);
}

export async function onRequestGet({ env }) {
  const errors = [];
  const diagnostics = {
    hasApiTennisKey: Boolean(env.API_TENNIS_KEY),
    hasNewsApiKey: Boolean(env.NEWS_API_KEY),
    matchCount: 0,
    playerCount: 0,
    newsCount: 0,
  };
  let matches = [];
  let players = [];
  let news = [];

  try {
    matches = await getMatches(env);
    diagnostics.matchCount = matches.length;
  } catch (error) {
    errors.push(`tennis matches: ${error.message}`);
  }

  try {
    players = await getPlayers(env);
    diagnostics.playerCount = players.length;
  } catch (error) {
    errors.push(`player stats: ${error.message}`);
  }

  try {
    news = await getNews(env);
    diagnostics.newsCount = news.length;
  } catch (error) {
    errors.push(`news: ${error.message}`);
  }

  if (!diagnostics.hasApiTennisKey) errors.push("missing API_TENNIS_KEY Cloudflare secret");
  if (!diagnostics.hasNewsApiKey) errors.push("missing NEWS_API_KEY Cloudflare secret");

  const hasLiveTennis = Boolean(env.API_TENNIS_KEY && (matches.length || players.length));
  const hasLiveNews = Boolean(env.NEWS_API_KEY && news.length);

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    source: {
      tennis: hasLiveTennis ? "API-Tennis" : "fallback",
      news: hasLiveNews ? "NewsAPI" : "fallback",
    },
    matches: matches.length ? matches : fallbackMatches,
    players: players.length ? players : fallbackPlayers,
    news: news.length ? news : fallbackNews,
    errors,
    diagnostics,
  });
}
