const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const RSS_NEWS_FEEDS = [
  { source: "Tennis.com", url: "https://www.tennis.com/roots/rss-feeds/news/" },
  { source: "Google News", url: "https://news.google.com/rss/search?q=tennis%20ATP%20WTA&hl=en-US&gl=US&ceid=US:en" },
];

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
    title: "Free RSS news feed is waiting for deployment",
    category: "Setup",
    time: "Now",
    summary: "Redeploy Cloudflare Pages to replace this fallback with live tennis headlines from free RSS feeds.",
    url: "#",
    source: "TennisTipz",
  },
];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=900",
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

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function getTagValue(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXml(match?.[1] || "");
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

function inferNewsCategory(title = "") {
  const text = title.toLowerCase();
  if (text.includes("injur") || text.includes("withdraw") || text.includes("return")) return "Player News";
  if (text.includes("rank") || text.includes("stat")) return "Trend";
  if (text.includes("draw") || text.includes("schedule") || text.includes("open") || text.includes("masters")) return "Tournament";
  return "News";
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

function normalizeRssItem(item, source, index) {
  const title = getTagValue(item, "title");
  const url = getTagValue(item, "link") || getTagValue(item, "guid");
  const summary = getTagValue(item, "description") || "Read the latest tennis update.";
  const published = new Date(getTagValue(item, "pubDate") || getTagValue(item, "published"));
  const time = Number.isNaN(published.getTime())
    ? "Latest"
    : published.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return {
    id: url || `${source}-${index}`,
    title: title || "Tennis update",
    category: inferNewsCategory(title),
    time,
    summary,
    url: url || "#",
    source,
  };
}

function parseRssItems(xml, source) {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)]
    .map((match, index) => normalizeRssItem(match[0], source, index))
    .filter((article) => article.title && article.url)
    .slice(0, 10);
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

async function getNews() {
  const feedResults = await Promise.all(
    RSS_NEWS_FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, { headers: { accept: "application/rss+xml, application/xml, text/xml" } });
      if (!response.ok) throw new Error(`${feed.source} returned ${response.status}`);
      const xml = await response.text();
      return parseRssItems(xml, feed.source);
    }),
  );

  const articles = feedResults.flat();
  return Array.from(new Map(articles.map((article) => [article.url, article])).values()).slice(0, 12);
}

export async function onRequestGet({ env }) {
  const errors = [];
  const diagnostics = {
    hasApiTennisKey: Boolean(env.API_TENNIS_KEY),
    matchCount: 0,
    playerCount: 0,
    newsCount: 0,
    newsProvider: "RSS",
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
    news = await getNews();
    diagnostics.newsCount = news.length;
  } catch (error) {
    errors.push(`news: ${error.message}`);
  }

  if (!diagnostics.hasApiTennisKey) errors.push("missing API_TENNIS_KEY Cloudflare secret");

  const hasLiveTennis = Boolean(env.API_TENNIS_KEY && (matches.length || players.length));
  const hasLiveNews = Boolean(news.length);

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    source: {
      tennis: hasLiveTennis ? "API-Tennis" : "fallback",
      news: hasLiveNews ? "RSS" : "fallback",
    },
    matches: matches.length ? matches : fallbackMatches,
    players: players.length ? players : fallbackPlayers,
    news: news.length ? news : fallbackNews,
    errors,
    diagnostics,
  });
}
