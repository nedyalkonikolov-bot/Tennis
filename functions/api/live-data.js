const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const CLOUDBET_API_BASE = "https://sports-api.cloudbet.com/pub/v2/odds";
const DEFAULT_CLOUDBET_URL = "https://www.cloudbet.com/en/sports/tennis";
const RSS_NEWS_FEEDS = [
  { source: "Tennis.com", url: "https://www.tennis.com/roots/rss-feeds/news/" },
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
  return String(value)
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
    .replace(/\s+[-\u2013]\s+(ATP Tour|WTA Tennis|Tennis\.com)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
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
  const leftLast = left[left.length - 1];
  const rightLast = right[right.length - 1];
  return leftLast === rightLast || normalizeName(a).includes(rightLast) || normalizeName(b).includes(leftLast);
}

function getTagRawValue(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i"));
  return decodeEntities(match?.[1] || "");
}

function getTagValue(item, tag) {
  return cleanText(getTagRawValue(item, tag));
}

function getAttributeValue(markup = "", attribute) {
  const match = String(markup).match(new RegExp(`${attribute}=(?:["']([^"']+)["']|([^\\s>]+))`, "i"));
  return decodeEntities(match?.[1] || match?.[2] || "").trim();
}

function normalizeImageUrl(value = "") {
  const clean = decodeEntities(value).trim();
  if (clean.startsWith("//")) return `https:${clean}`;
  return /^https?:\/\//i.test(clean) ? clean : "";
}

function getRssImageUrl(item) {
  const candidates = [
    item.match(/<media:content[^>]+>/i)?.[0],
    item.match(/<media:thumbnail[^>]+>/i)?.[0],
    item.match(/<enclosure[^>]+>/i)?.[0],
    item.match(/<image[^>]+>/i)?.[0],
  ];

  for (const candidate of candidates) {
    const url = normalizeImageUrl(
      getAttributeValue(candidate, "url") || getAttributeValue(candidate, "href") || getAttributeValue(candidate, "src"),
    );
    if (url) return url;
  }

  const description = getTagRawValue(item, "description");
  const inlineImage = description.match(/<img[^>]+src=(?:["']([^"']+)["']|([^\s>]+))/i);
  return normalizeImageUrl(inlineImage?.[1] || inlineImage?.[2] || "");
}

function getMetaImageUrl(html = "") {
  const metaTags = html.match(/<meta[^>]+>/gi) || [];
  for (const tag of metaTags) {
    const property = (getAttributeValue(tag, "property") || getAttributeValue(tag, "name")).toLowerCase();
    if (!["og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(property)) continue;
    const content = normalizeImageUrl(getAttributeValue(tag, "content"));
    if (content) return content;
  }
  const directMatch = html.match(/(?:og:image(?::url)?|twitter:image(?::src)?)[^>]+content=(?:["']([^"']+)["']|([^\s>]+))/i);
  const directUrl = normalizeImageUrl(directMatch?.[1] || directMatch?.[2] || "");
  if (directUrl) return directUrl;
  const jsonLdMatch = html.match(/"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/i);
  return normalizeImageUrl(jsonLdMatch?.[1] || jsonLdMatch?.[2] || "");
}

async function fetchArticleImageUrl(articleUrl) {
  if (!articleUrl || !articleUrl.includes("tennis.com/")) return "";
  try {
    const response = await fetch(articleUrl, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 TennisTipzBot/1.0" },
    });
    if (!response.ok) return "";
    return getMetaImageUrl(await response.text());
  } catch {
    return "";
  }
}

function inferSurface(event) {
  const text = `${event.tournament_name || ""} ${event.event_type_type || ""} ${event.competition?.name || ""} ${event.name || ""}`.toLowerCase();
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
  const predictedWinnerOdds = predictedSide === "home" ? cloudbetOdds?.home : cloudbetOdds?.away;
  const confidence = Math.max(52, Math.min(82, Math.round(55 + Math.abs(firstScore - secondScore) * 0.35)));
  return { predictedWinner, predictedSide, confidence, predictedWinnerOdds: predictedWinnerOdds || "N/A" };
}

function eventStatus(event) {
  return String(event.event_status || event.status || "").toLowerCase().trim();
}

function eventScore(event) {
  return String(event.event_final_result || event.event_game_result || "").trim();
}

function isLiveEvent(event) {
  const status = eventStatus(event);
  return event.event_live === "1" || status.includes("live") || /^set\s*\d+/i.test(status) || status.includes("in progress");
}

function isFinishedEvent(event) {
  const status = eventStatus(event);
  const finishedTerms = ["finished", "ended", "complete", "retired", "walkover", "w/o", "wo", "cancelled", "canceled", "abandoned", "settled"];
  return Boolean(eventScore(event)) || finishedTerms.some((term) => status.includes(term));
}

function isUpcomingEvent(event) {
  const status = eventStatus(event);
  if (isLiveEvent(event) || isFinishedEvent(event)) return false;
  if (!status || status === "-" || status === "scheduled" || status === "not started" || status === "upcoming" || status === "trading") return true;
  return status.includes("scheduled") || status.includes("not started") || status.includes("trading");
}

function normalizeCloudbetMatch(event, recentForms = {}, betUrl = DEFAULT_CLOUDBET_URL) {
  const odds = event.cloudbetOdds;
  const playerA = event.event_first_player;
  const playerB = event.event_second_player;
  const recentA = recentForms.first || { wins: 0, losses: 0, matches: 0, winRate: 50 };
  const recentB = recentForms.second || { wins: 0, losses: 0, matches: 0, winRate: 50 };
  const prediction = makePredictionFromForm(event, recentA, recentB, odds);
  const startDate = event.startTime || event.cutoffTime || "";
  const formattedStart = startDate
    ? new Date(startDate).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Available now";

  return {
    id: String(event.event_key),
    tournament: event.tournament_name || "Cloudbet Tennis",
    startTime: formattedStart,
    playerA,
    playerB,
    surface: inferSurface(event),
    market: `${prediction.predictedWinner} to Win`,
    formA: recentA.winRate,
    formB: recentB.winRate,
    recentA,
    recentB,
    serveHoldA: 68 + (asNumber(event.first_player_key, playerA.length) % 24),
    serveHoldB: 68 + (asNumber(event.second_player_key, playerB.length) % 24),
    returnEdge: recentA.winRate - recentB.winRate,
    h2hEdge: 0,
    odds: prediction.predictedWinnerOdds,
    oddsSource: "Cloudbet",
    cloudbetOdds: odds,
    predictedWinner: prediction.predictedWinner,
    predictedSide: prediction.predictedSide,
    predictedWinnerOdds: prediction.predictedWinnerOdds,
    confidence: prediction.confidence,
    status: isLiveEvent(event) ? "Live" : "Scheduled",
    score: "",
    live: isLiveEvent(event),
    tour: inferTour(`${event.tournament_name || ""} ${playerA} ${playerB}`),
    betUrl,
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
  return { id: url || `${source}-${index}`, title: title || "Tennis update", category: inferNewsCategory(title), time, summary, url: url || "#", imageUrl, source };
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
    headers: { accept: "application/json", "content-type": "application/json", "x-api-key": env.CLOUDBET_API_KEY },
  });
  if (!response.ok) throw new Error(`Cloudbet ${path} returned ${response.status}`);
  return response.json();
}

function getMarketSelections(market) {
  const submarkets = market?.submarkets || market?.subMarkets || {};
  const groups = Object.values(submarkets);
  if (groups.length) return groups.flatMap((group) => group?.selections || []);
  return market?.selections || [];
}

function isEnabledSelection(selection) {
  const price = asFloat(selection?.price || selection?.odds);
  return price && (!selection.status || selection.status === "SELECTION_ENABLED") && (!selection.side || selection.side === "BACK");
}

function extractWinnerOddsFromEvent(event) {
  if (!event?.home?.name || !event?.away?.name || isFinishedEvent(event)) return null;
  const markets = event.markets || {};
  const winnerEntry = Object.entries(markets).find(([key, market]) => {
    const name = String(market?.name || "").toLowerCase();
    return key === "tennis.winner" || key.endsWith(".winner") || name === "winner" || name.includes("money line") || name.includes("moneyline");
  });
  if (!winnerEntry) return null;
  const [marketKey, market] = winnerEntry;
  const selections = getMarketSelections(market).filter(isEnabledSelection);
  const homeSelection = selections.find((selection) => selection.outcome === "home" || selection.name === event.home?.name);
  const awaySelection = selections.find((selection) => selection.outcome === "away" || selection.name === event.away?.name);
  const home = asFloat(homeSelection?.price || homeSelection?.odds);
  const away = asFloat(awaySelection?.price || awaySelection?.odds);
  if (!home || !away) return null;
  return {
    eventId: event.id,
    eventKey: event.key,
    eventName: event.name || `${event.home.name} vs ${event.away.name}`,
    homeName: event.home.name,
    awayName: event.away.name,
    home: home.toFixed(2),
    away: away.toFixed(2),
    marketKey,
    marketUrlHome: `${marketKey}/home${homeSelection?.params ? `?${homeSelection.params}` : ""}`,
    marketUrlAway: `${marketKey}/away${awaySelection?.params ? `?${awaySelection.params}` : ""}`,
  };
}

function normalizeCloudbetEvent(event) {
  const odds = extractWinnerOddsFromEvent(event);
  if (!odds) return null;
  return {
    event_key: String(event.id || event.key || odds.eventName),
    event_first_player: odds.homeName,
    event_second_player: odds.awayName,
    first_player_key: "",
    second_player_key: "",
    tournament_name: event.competition?.name || event.name || "Cloudbet Tennis",
    event_type_type: event.competition?.category?.name || event.competition?.key || "Cloudbet",
    event_date: event.startTime || event.cutoffTime || "",
    event_status: event.status || "TRADING",
    startTime: event.startTime || event.cutoffTime || "",
    cutoffTime: event.cutoffTime || "",
    status: event.status || "TRADING",
    competition: event.competition || null,
    name: event.name || odds.eventName,
    cloudbetOdds: odds,
  };
}

function sortCloudbetEvents(a, b) {
  if (isLiveEvent(a) !== isLiveEvent(b)) return isLiveEvent(a) ? -1 : 1;
  return String(a.startTime || a.cutoffTime || "").localeCompare(String(b.startTime || b.cutoffTime || ""));
}

function dedupeEvents(events) {
  return Array.from(new Map(events.map((event) => [event.event_key || JSON.stringify(event), event])).values());
}

async function getCloudbetTennisEvents(env) {
  if (!env.CLOUDBET_API_KEY) return [];
  const sport = await fetchCloudbet(env, "/sports/tennis");
  const competitions = (sport?.categories || [])
    .flatMap((category) => (category.competitions || []).map((competition) => ({ ...competition, category })))
    .filter((competition) => competition.eventCount > 0)
    .sort((a, b) => (b.eventCount || 0) - (a.eventCount || 0))
    .slice(0, 40);
  const competitionPayloads = await Promise.all(
    competitions.map((competition) => fetchCloudbet(env, `/competitions/${competition.key}?markets=tennis.winner`).catch(() => null)),
  );
  return dedupeEvents(
    competitionPayloads
      .flatMap((payload) => payload?.events || [])
      .map(normalizeCloudbetEvent)
      .filter(Boolean)
      .filter((event) => isLiveEvent(event) || isUpcomingEvent(event))
      .sort(sortCloudbetEvents),
  );
}

async function findApiTennisPlayerKey(env, playerName, cache) {
  const key = normalizeName(playerName);
  if (!key || !env.API_TENNIS_KEY) return "";
  if (cache.has(key)) return cache.get(key);
  try {
    const lastName = key.split(" ").at(-1);
    const result = await fetchApiTennis(env, "get_players", { player_name: lastName });
    const match = (result || []).find((player) => namesLookSimilar(player.player_name || player.player || player.name, playerName));
    const playerKey = String(match?.player_key || match?.player_id || "");
    cache.set(key, playerKey);
    return playerKey;
  } catch {
    cache.set(key, "");
    return "";
  }
}

async function enrichCloudbetEventsWithApiTennisKeys(env, events) {
  const cache = new Map();
  return Promise.all(
    events.map(async (event) => ({
      ...event,
      first_player_key: await findApiTennisPlayerKey(env, event.event_first_player, cache),
      second_player_key: await findApiTennisPlayerKey(env, event.event_second_player, cache),
    })),
  );
}

async function getRecentFormsForMatches(env, matches) {
  return Promise.all(
    matches.map(async (match) => {
      if (!match.first_player_key || !match.second_player_key) {
        return { first: { wins: 0, losses: 0, matches: 0, winRate: 50 }, second: { wins: 0, losses: 0, matches: 0, winRate: 50 } };
      }
      try {
        const result = await fetchApiTennis(env, "get_H2H", { first_player_key: match.first_player_key, second_player_key: match.second_player_key });
        return {
          first: getRecentForm(result.firstPlayerResults || [], match.first_player_key, 100),
          second: getRecentForm(result.secondPlayerResults || [], match.second_player_key, 100),
        };
      } catch {
        return { first: { wins: 0, losses: 0, matches: 0, winRate: 50 }, second: { wins: 0, losses: 0, matches: 0, winRate: 50 } };
      }
    }),
  );
}

function isSinglesMatch(event) {
  return !String(event.event_first_player || "").includes("/") && !String(event.event_second_player || "").includes("/");
}

async function getMatches(env, betUrl) {
  const cloudbetEvents = (await getCloudbetTennisEvents(env)).filter(isSinglesMatch);
  const liveEvents = cloudbetEvents.filter(isLiveEvent).slice(0, 8);
  const upcomingEvents = cloudbetEvents.filter((event) => !isLiveEvent(event)).slice(0, 12);
  const bettingEvents = await enrichCloudbetEventsWithApiTennisKeys(env, [...liveEvents, ...upcomingEvents]);
  const recentForms = await getRecentFormsForMatches(env, bettingEvents);
  return bettingEvents.map((event, index) => normalizeCloudbetMatch(event, recentForms[index], betUrl));
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
      return parseRssItems(await response.text(), feed.source);
    }),
  );
  const articles = Array.from(new Map(feedResults.flat().map((article) => [article.url, article])).values()).slice(0, 12);
  return Promise.all(articles.map(async (article) => ({ ...article, imageUrl: article.imageUrl || (await fetchArticleImageUrl(article.url)) })));
}

export async function onRequestGet({ env }) {
  const betUrl = env.CLOUDBET_AFFILIATE_URL || DEFAULT_CLOUDBET_URL;
  const errors = [];
  const diagnostics = {
    hasApiTennisKey: Boolean(env.API_TENNIS_KEY),
    hasCloudbetApiKey: Boolean(env.CLOUDBET_API_KEY),
    hasCloudbetAffiliateUrl: Boolean(env.CLOUDBET_AFFILIATE_URL),
    matchCount: 0,
    liveMatchCount: 0,
    upcomingMatchCount: 0,
    playerCount: 0,
    newsCount: 0,
    newsWithImagesCount: 0,
    newsProvider: "Tennis.com RSS",
    playerStats: "Top 150 ATP + Top 150 WTA",
    predictionSource: "Cloudbet tennis.winner markets",
    predictionWindow: "Last 100 days where API-Tennis player keys match",
  };
  let matches = [];
  let players = [];
  let news = [];

  try {
    matches = await getMatches(env, betUrl);
    diagnostics.matchCount = matches.length;
    diagnostics.liveMatchCount = matches.filter((match) => match.live).length;
    diagnostics.upcomingMatchCount = matches.filter((match) => !match.live).length;
  } catch (error) {
    errors.push(`cloudbet predictions: ${error.message}`);
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
    diagnostics.newsWithImagesCount = news.filter((article) => article.imageUrl).length;
  } catch (error) {
    errors.push(`news: ${error.message}`);
  }

  if (!diagnostics.hasApiTennisKey) errors.push("missing API_TENNIS_KEY Cloudflare secret");
  if (!diagnostics.hasCloudbetApiKey) errors.push("missing CLOUDBET_API_KEY Cloudflare secret for Cloudbet odds");
  if (!diagnostics.hasCloudbetAffiliateUrl) errors.push("missing CLOUDBET_AFFILIATE_URL Cloudflare variable for affiliate click-throughs");

  const hasLiveTennis = Boolean(env.API_TENNIS_KEY && players.length);
  const hasCloudbetMatches = Boolean(matches.length);
  const hasLiveNews = Boolean(news.length);

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    source: {
      tennis: hasLiveTennis ? "API-Tennis" : "fallback",
      odds: hasCloudbetMatches ? "Cloudbet" : "fallback",
      news: hasLiveNews ? "Tennis.com" : "fallback",
    },
    betUrl,
    matches,
    players: players.length ? players : fallbackPlayers,
    news: news.length ? news : fallbackNews,
    errors,
    diagnostics,
  });
}
