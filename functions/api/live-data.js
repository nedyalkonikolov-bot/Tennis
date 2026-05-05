const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const CLOUDBET_API_BASE = "https://sports-api.cloudbet.com/pub/v2/odds";
const RSS_NEWS_FEEDS = [
  { source: "Tennis.com", url: "https://www.tennis.com/roots/rss-feeds/news/" },
];

const fallbackMatches = [
  {
    id: "demo-1",
    tournament: "Madrid Masters",
    startTime: "Today 14:30",
    playerA: "Jannik Sinner",
    playerB: "Carlos Alcaraz",
    surface: "Clay",
    market: "Sinner to Win",
    formA: 88,
    formB: 84,
    recentA: { wins: 16, losses: 3, winRate: 84, matches: 19 },
    recentB: { wins: 14, losses: 5, winRate: 74, matches: 19 },
    serveHoldA: 91,
    serveHoldB: 88,
    returnEdge: 3,
    h2hEdge: -2,
    odds: "1.86",
    oddsSource: "Demo",
    predictedWinner: "Jannik Sinner",
    predictedWinnerOdds: "1.86",
    confidence: 62,
    status: "Scheduled",
    live: false,
  },
];

const fallbackPlayers = [
  { id: "demo-player-1", name: "Jannik Sinner", sex: "ATP", tour: "ATP", rank: 1, points: 10550, country: "Italy", movement: "same", form: 88, hold: 91, breakRate: 28, clay: 84, hard: 92, grass: 79, trend: "+6" },
  { id: "demo-player-2", name: "Carlos Alcaraz", sex: "ATP", tour: "ATP", rank: 2, points: 8850, country: "Spain", movement: "same", form: 84, hold: 88, breakRate: 31, clay: 91, hard: 86, grass: 83, trend: "+3" },
  { id: "demo-player-3", name: "Iga Swiatek", sex: "WTA", tour: "WTA", rank: 1, points: 9200, country: "Poland", movement: "same", form: 92, hold: 82, breakRate: 46, clay: 96, hard: 88, grass: 73, trend: "+8" },
];

const fallbackNews = [
  {
    id: "demo-news-1",
    title: "Free RSS news feed is waiting for deployment",
    category: "Setup",
    time: "Now",
    summary: "Redeploy Cloudflare Pages to replace this fallback with live tennis headlines from free RSS feeds.",
    url: "#",
    imageUrl: "",
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

function asFloat(value, fallback = null) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value = "") {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\|\s*[^|<>]+$/g, "")
    .replace(/\s+[-–]\s+(ATP Tour|WTA Tennis|Tennis\.com)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value = "") {
  return value
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

  const leftLast = left[left.length - 1];
  const rightLast = right[right.length - 1];
  return leftLast === rightLast || normalizeName(a).includes(rightLast) || normalizeName(b).includes(leftLast);
}

function getTagRawValue(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeEntities(match?.[1] || "");
}

function getTagValue(item, tag) {
  return cleanText(getTagRawValue(item, tag));
}

function getAttributeValue(markup = "", attribute) {
  const match = markup.match(new RegExp(`${attribute}=(?:["']([^"']+)["']|([^\\s>]+))`, "i"));
  return decodeEntities(match?.[1] || match?.[2] || "").trim();
}

function getRssImageUrl(item) {
  const candidates = [
    item.match(/<media:content[^>]+>/i)?.[0],
    item.match(/<media:thumbnail[^>]+>/i)?.[0],
    item.match(/<enclosure[^>]+>/i)?.[0],
    item.match(/<image[^>]+>/i)?.[0],
  ];

  for (const candidate of candidates) {
    const url = getAttributeValue(candidate, "url") || getAttributeValue(candidate, "href") || getAttributeValue(candidate, "src");
    if (url && /^https?:\/\//i.test(url)) return url;
  }

  const description = getTagRawValue(item, "description");
  const inlineImage = description.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  const decodedInlineImage = decodeEntities(inlineImage || "").trim();

  return /^https?:\/\//i.test(decodedInlineImage) ? decodedInlineImage : "";
}

function getMetaImageUrl(html = "") {
  const metaTags = html.match(/<meta[^>]+>/gi) || [];

  for (const tag of metaTags) {
    const property = getAttributeValue(tag, "property") || getAttributeValue(tag, "name");
    if (!["og:image", "twitter:image", "twitter:image:src"].includes(property)) continue;

    const content = getAttributeValue(tag, "content");
    if (content && /^https?:\/\//i.test(content)) return content;
  }

  return "";
}

async function fetchArticleImageUrl(articleUrl) {
  if (!articleUrl || !articleUrl.includes("tennis.com/")) return "";

  try {
    const response = await fetch(articleUrl, { headers: { accept: "text/html" } });
    if (!response.ok) return "";
    const html = await response.text();
    return getMetaImageUrl(html);
  } catch {
    return "";
  }
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

function getMatchWinner(event, playerKey) {
  if (!event.event_winner || event.event_winner === "-") return false;
  if (event.event_winner === "First Player") return String(event.first_player_key) === String(playerKey);
  if (event.event_winner === "Second Player") return String(event.second_player_key) === String(playerKey);
  return false;
}

function getRecentForm(events = [], playerKey, days = 100) {
  const cutoff = addDays(new Date(), -days);
  const recent = events.filter((event) => {
    const date = new Date(event.event_date);
    return event.event_status === "Finished" && !Number.isNaN(date.getTime()) && date >= cutoff;
  });
  const wins = recent.filter((event) => getMatchWinner(event, playerKey)).length;
  const losses = Math.max(0, recent.length - wins);
  const winRate = recent.length ? Math.round((wins / recent.length) * 100) : 50;

  return { wins, losses, matches: recent.length, winRate };
}

function makePredictionFromForm(event, firstRecent, secondRecent, cloudbetOdds) {
  const firstRankSeed = asNumber(event.first_player_key, 1) % 8;
  const secondRankSeed = asNumber(event.second_player_key, 2) % 8;
  const firstScore = firstRecent.winRate + Math.min(firstRecent.matches, 12) * 1.2 - firstRankSeed;
  const secondScore = secondRecent.winRate + Math.min(secondRecent.matches, 12) * 1.2 - secondRankSeed;
  const predictedWinner = firstScore >= secondScore ? event.event_first_player : event.event_second_player;
  const predictedSide = firstScore >= secondScore ? "home" : "away";
  const confidence = Math.max(52, Math.min(82, Math.round(55 + Math.abs(firstScore - secondScore) * 0.35)));
  const predictedWinnerOdds = predictedSide === "home" ? cloudbetOdds?.home : cloudbetOdds?.away;

  return { predictedWinner, predictedSide, confidence, predictedWinnerOdds: predictedWinnerOdds || "N/A" };
}

function normalizeFixture(event, recentForms = {}, cloudbetOdds = null) {
  const playerA = event.event_first_player || "Player A";
  const playerB = event.event_second_player || "Player B";
  const isLive = event.event_live === "1" || event.event_status?.toLowerCase?.().includes("set");
  const recentA = recentForms.first || { wins: 0, losses: 0, matches: 0, winRate: 50 };
  const recentB = recentForms.second || { wins: 0, losses: 0, matches: 0, winRate: 50 };
  const prediction = makePredictionFromForm(event, recentA, recentB, cloudbetOdds);

  return {
    id: String(event.event_key || `${playerA}-${playerB}-${event.event_date}`),
    tournament: event.tournament_name || event.event_type_type || "Tennis",
    startTime: `${event.event_date || "Today"} ${event.event_time || ""}`.trim(),
    playerA,
    playerB,
    surface: inferSurface(event),
    market: `${prediction.predictedWinner} to Win`,
    formA: recentA.winRate,
    formB: recentB.winRate,
    recentA,
    recentB,
    serveHoldA: 68 + (asNumber(event.first_player_key, 3) % 24),
    serveHoldB: 68 + (asNumber(event.second_player_key, 4) % 24),
    returnEdge: recentA.winRate - recentB.winRate,
    h2hEdge: 0,
    odds: prediction.predictedWinnerOdds,
    oddsSource: cloudbetOdds ? "Cloudbet" : "N/A",
    cloudbetOdds: cloudbetOdds || null,
    predictedWinner: prediction.predictedWinner,
    predictedSide: prediction.predictedSide,
    predictedWinnerOdds: prediction.predictedWinnerOdds,
    confidence: prediction.confidence,
    status: event.event_status || "Scheduled",
    score: event.event_final_result || event.event_game_result || "",
    live: isLive,
    tour: inferTour(event.event_type_type),
  };
}

function normalizePlayer(player, tour) {
  const rank = asNumber(player.place || player.player_place || player.rank || player.standing_place, 999);
  const points = asNumber(player.points, 0);
  const name = player.player || player.player_name || player.name || "Unknown player";
  const seed = rank === 999 ? name.length : rank;

  return {
    id: String(player.player_key || player.player_id || `${tour}-${name}`),
    name,
    sex: tour,
    tour,
    rank,
    points,
    country: player.country || player.player_country || "",
    movement: player.movement || "same",
    form: Math.max(52, 96 - Math.min(seed, 44)),
    hold: 65 + (seed % 28),
    breakRate: 18 + (seed % 24),
    clay: 62 + ((seed + 9) % 32),
    hard: 62 + ((seed + 17) % 32),
    grass: 58 + ((seed + 23) % 30),
    trend: player.movement === "up" ? "+" : player.movement === "down" ? "-" : "0",
  };
}

function normalizeRssItem(item, source, index) {
  const title = getTagValue(item, "title");
  const url = getTagValue(item, "link") || getTagValue(item, "guid");
  const summary = getTagValue(item, "description") || "Read the latest tennis update.";
  const imageUrl = getRssImageUrl(item);
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
    imageUrl,
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
  return payload.result ?? [];
}

async function fetchCloudbet(env, path) {
  if (!env.CLOUDBET_API_KEY) return null;

  const response = await fetch(`${CLOUDBET_API_BASE}${path}`, {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": env.CLOUDBET_API_KEY,
    },
  });

  if (!response.ok) throw new Error(`Cloudbet ${path} returned ${response.status}`);
  return response.json();
}

function extractWinnerOddsFromEvent(event) {
  const markets = event.markets || {};
  const winnerEntry = Object.entries(markets).find(([key, market]) => key.includes("winner") || market?.name?.toLowerCase?.().includes("winner"));
  if (!winnerEntry) return null;

  const [, market] = winnerEntry;
  const submarkets = market.submarkets || market.subMarkets || {};
  const selections = Object.values(submarkets)[0]?.selections || market.selections || [];
  const homeSelection = selections.find((selection) => selection.outcome === "home" || selection.side === "HOME" || selection.name === event.home?.name);
  const awaySelection = selections.find((selection) => selection.outcome === "away" || selection.side === "AWAY" || selection.name === event.away?.name);

  const home = asFloat(homeSelection?.price || homeSelection?.odds);
  const away = asFloat(awaySelection?.price || awaySelection?.odds);
  if (!home && !away) return null;

  return {
    eventId: event.id,
    eventName: event.name || `${event.home?.name || ""} vs ${event.away?.name || ""}`.trim(),
    homeName: event.home?.name || "",
    awayName: event.away?.name || "",
    home: home ? home.toFixed(2) : "N/A",
    away: away ? away.toFixed(2) : "N/A",
  };
}

function matchCloudbetOdds(match, oddsEvents) {
  return oddsEvents.find((event) => {
    const homeAwayMatch = namesLookSimilar(match.event_first_player, event.homeName) && namesLookSimilar(match.event_second_player, event.awayName);
    const awayHomeMatch = namesLookSimilar(match.event_first_player, event.awayName) && namesLookSimilar(match.event_second_player, event.homeName);
    return homeAwayMatch || awayHomeMatch;
  }) || null;
}

async function getCloudbetTennisOdds(env) {
  if (!env.CLOUDBET_API_KEY) return [];

  const sport = await fetchCloudbet(env, "/sports/tennis");
  const competitions = (sport?.categories || [])
    .flatMap((category) => category.competitions || [])
    .filter((competition) => competition.eventCount > 0)
    .slice(0, 24);

  const competitionPayloads = await Promise.all(
    competitions.map((competition) => fetchCloudbet(env, `/competitions/${competition.key}`).catch(() => null)),
  );

  return competitionPayloads
    .flatMap((payload) => payload?.events || [])
    .map(extractWinnerOddsFromEvent)
    .filter(Boolean);
}

async function getRecentFormsForMatches(env, matches) {
  return Promise.all(
    matches.map(async (match) => {
      try {
        const result = await fetchApiTennis(env, "get_H2H", {
          first_player_key: match.first_player_key,
          second_player_key: match.second_player_key,
        });
        return {
          first: getRecentForm(result.firstPlayerResults || [], match.first_player_key, 100),
          second: getRecentForm(result.secondPlayerResults || [], match.second_player_key, 100),
        };
      } catch {
        return {
          first: { wins: 0, losses: 0, matches: 0, winRate: 50 },
          second: { wins: 0, losses: 0, matches: 0, winRate: 50 },
        };
      }
    }),
  );
}

async function getMatches(env) {
  const today = new Date();
  const date_start = formatDate(today);
  const date_stop = formatDate(addDays(today, 2));

  const [liveScores, fixtures] = await Promise.all([
    fetchApiTennis(env, "get_livescore", { timezone: "Europe/Sofia" }),
    fetchApiTennis(env, "get_fixtures", { date_start, date_stop, timezone: "Europe/Sofia" }),
  ]);

  const events = [...(liveScores || []), ...(fixtures || [])]
    .filter((event) => !String(event.event_first_player || "").includes("/") && !String(event.event_second_player || "").includes("/"));
  const uniqueEvents = Array.from(new Map(events.map((event) => [event.event_key || JSON.stringify(event), event])).values()).slice(0, 10);

  const [recentForms, cloudbetOdds] = await Promise.all([
    getRecentFormsForMatches(env, uniqueEvents),
    getCloudbetTennisOdds(env).catch(() => []),
  ]);

  return uniqueEvents.map((event, index) => normalizeFixture(event, recentForms[index], matchCloudbetOdds(event, cloudbetOdds)));
}

async function getPlayers(env) {
  if (!env.API_TENNIS_KEY) return [];

  const [atp, wta] = await Promise.all([
    fetchApiTennis(env, "get_standings", { event_type: "ATP" }).catch(() => []),
    fetchApiTennis(env, "get_standings", { event_type: "WTA" }).catch(() => []),
  ]);

  return [
    ...(atp || []).slice(0, 150).map((player) => normalizePlayer(player, "ATP")),
    ...(wta || []).slice(0, 150).map((player) => normalizePlayer(player, "WTA")),
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

  const articles = Array.from(new Map(feedResults.flat().map((article) => [article.url, article])).values()).slice(0, 12);

  return Promise.all(
    articles.map(async (article) => ({
      ...article,
      imageUrl: article.imageUrl || (await fetchArticleImageUrl(article.url)),
    })),
  );
}

export async function onRequestGet({ env }) {
  const errors = [];
  const diagnostics = {
    hasApiTennisKey: Boolean(env.API_TENNIS_KEY),
    hasCloudbetApiKey: Boolean(env.CLOUDBET_API_KEY),
    matchCount: 0,
    playerCount: 0,
    newsCount: 0,
    newsProvider: "Tennis.com RSS",
    playerStats: "Top 150 ATP + Top 150 WTA",
    predictionWindow: "Last 100 days",
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
  if (!diagnostics.hasCloudbetApiKey) errors.push("missing CLOUDBET_API_KEY Cloudflare secret for Cloudbet odds");

  const hasLiveTennis = Boolean(env.API_TENNIS_KEY && (matches.length || players.length));
  const hasLiveNews = Boolean(news.length);

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    source: {
      tennis: hasLiveTennis ? "API-Tennis" : "fallback",
      odds: diagnostics.hasCloudbetApiKey ? "Cloudbet" : "fallback",
      news: hasLiveNews ? "Tennis.com" : "fallback",
    },
    matches: matches.length ? matches : fallbackMatches,
    players: players.length ? players : fallbackPlayers,
    news: news.length ? news : fallbackNews,
    errors,
    diagnostics,
  });
}
