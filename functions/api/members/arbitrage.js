const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const CLOUDBET_API_BASE = "https://sports-api.cloudbet.com/pub/v2/odds";
const POLYMARKET_GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOUDBET_MARKETS_QUERY = "?markets=tennis.winner&markets=tennis.winner_and_total";
const DEFAULT_CLOUDBET_AFFILIATE_URL = "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Arbitrage&aftm_cid=4";
const BLOCKED_RE = /\b(simulated|simulation|virtual|srl|reality league|itf|utr|exhibition|junior|boys|girls|college|doubles)\b/i;
const CROSS_SPORT_BLOCKED_RE = /\b(simulated|simulation|virtual|srl|reality league|esoccer|ebasketball|efootball|specials|politics|finance|crypto|weather)\b/i;
const DEFAULT_CLOUDBET_SPORTS = ["tennis", "soccer", "basketball", "baseball", "american-football", "ice-hockey", "boxing", "mma", "cricket", "rugby"];
const POLYMARKET_SPORT_SERIES = ["mlb", "wnba", "nba", "nfl", "ncaaf", "ncaab", "nhl", "tennis", "ufc", "mma", "epl", "mls", "champions-league"];
const POLYMARKET_TO_CLOUDBET_SPORTS = {
  mlb: ["baseball"],
  wnba: ["basketball"],
  nba: ["basketball"],
  nfl: ["american-football"],
  ncaaf: ["american-football"],
  ncaab: ["basketball"],
  nhl: ["ice-hockey"],
  tennis: ["tennis"],
  ufc: ["mma"],
  mma: ["mma"],
  epl: ["soccer"],
  mls: ["soccer"],
  "champions-league": ["soccer"],
};
const POLYMARKET_COMPETITION_HINTS = {
  mlb: ["mlb"],
  wnba: ["wnba"],
  nba: ["nba"],
  nfl: ["nfl"],
  ncaaf: ["ncaaf", "ncaa football", "college football"],
  ncaab: ["ncaab", "ncaa", "college basketball"],
  nhl: ["nhl"],
  tennis: ["atp", "wta", "grand slam"],
  ufc: ["ufc"],
  mma: ["ufc", "mma"],
  epl: ["epl", "premier league"],
  mls: ["mls"],
  "champions-league": ["champions league"],
};
const BAD_BINARY_MARKET_RE = /\b(total|over|under|spread|handicap|correct score|set betting|game betting|quarter|period|half|first five|first 5|5 innings?|inning|tied?|draw|method|round|map|race to|player props?|team total|points|goals)\b/i;
const GOOD_BINARY_MARKET_RE = /\b(winner|moneyline|match odds|match result|head to head|h2h|to win)\b/i;
const SAME_EVENT_MAX_HOURS = 48;
const SPORTS_ALIAS_TOKENS = {
  atl: "atlanta",
  ari: "arizona",
  bkn: "brooklyn",
  bos: "boston",
  buf: "buffalo",
  car: "carolina",
  cha: "charlotte",
  chi: "chicago",
  cin: "cincinnati",
  cle: "cleveland",
  col: "colorado",
  con: "connecticut",
  conn: "connecticut",
  dal: "dallas",
  den: "denver",
  det: "detroit",
  gb: "green bay",
  gs: "golden state",
  gsw: "golden state",
  hou: "houston",
  ind: "indiana",
  jac: "jacksonville",
  jax: "jacksonville",
  kc: "kansas city",
  la: "los angeles",
  lac: "los angeles chargers",
  lad: "los angeles dodgers",
  lal: "los angeles lakers",
  lv: "las vegas",
  mia: "miami",
  mil: "milwaukee",
  min: "minnesota",
  ne: "new england",
  ny: "new york",
  nyg: "new york giants",
  nyj: "new york jets",
  nym: "new york mets",
  nyy: "new york yankees",
  okc: "oklahoma city",
  phi: "philadelphia",
  phx: "phoenix",
  pit: "pittsburgh",
  por: "portland",
  sa: "san antonio",
  sac: "sacramento",
  sd: "san diego",
  sea: "seattle",
  sf: "san francisco",
  stl: "st louis",
  tb: "tampa bay",
  ten: "tennessee",
  tor: "toronto",
  uta: "utah",
  was: "washington",
  wsh: "washington",
};
const GENERIC_ENTITY_TOKENS = new Set([
  "the",
  "team",
  "club",
  "fc",
  "afc",
  "cf",
  "sc",
  "city",
  "state",
  "united",
  "women",
  "woman",
  "mens",
  "womens",
  "men",
  "w",
  "m",
]);

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
  } catch {
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

function parseProbability(value) {
  const price = Number.parseFloat(value);
  return Number.isFinite(price) && price > 0.01 && price < 0.99 ? price : null;
}

function clampNumber(value, fallback, min, max) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function clampInteger(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function splitCamelCase(value = "") {
  return String(value).replace(/([a-z])([A-Z])/g, "$1 $2");
}

function expandSportsAliases(value = "") {
  return String(value)
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => (SPORTS_ALIAS_TOKENS[token] || token).split(" "))
    .join(" ");
}

function normalizeName(value = "") {
  const clean = splitCamelCase(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return expandSportsAliases(clean).replace(/\s+/g, " ").trim();
}

function safeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizedTokens(value = "") {
  return normalizeName(value).split(" ").filter(Boolean);
}

function importantTokens(value = "") {
  return normalizedTokens(value)
    .filter((part) => part.length > 1 && !GENERIC_ENTITY_TOKENS.has(part));
}

function includesNormalizedPhrase(haystack = "", needle = "") {
  return Boolean(haystack && needle && ` ${haystack} `.includes(` ${needle} `));
}

function entityMatchScore(text = "", entity = "") {
  const haystack = normalizeName(text);
  const needle = normalizeName(entity);
  if (!haystack || !needle) return { matched: false, score: 0, reason: "missing text" };
  if (includesNormalizedPhrase(haystack, needle)) return { matched: true, score: 1, reason: "exact phrase" };

  const haystackTokens = new Set(normalizedTokens(text));
  const tokens = importantTokens(entity);
  if (!tokens.length) return { matched: false, score: 0, reason: "no distinctive tokens" };

  const hits = tokens.filter((token) => haystackTokens.has(token));
  const ratio = hits.length / tokens.length;
  const distinctiveLastToken = [...tokens].reverse().find((token) => token.length >= 4 && !GENERIC_ENTITY_TOKENS.has(token));
  const lastTokenMatch = Boolean(distinctiveLastToken && haystackTokens.has(distinctiveLastToken));
  const matched = tokens.length >= 2
    ? lastTokenMatch || hits.length === tokens.length
    : hits.length >= 1;
  const score = matched ? Math.max(ratio, lastTokenMatch ? 0.72 : 0) : ratio;
  return {
    matched,
    score: Math.round(score * 100) / 100,
    reason: matched ? `token match: ${hits.join(", ") || distinctiveLastToken}` : `weak token match: ${hits.join(", ") || "none"}`,
  };
}

function bestEntityMatchScore(polyMarket = {}, entity = "") {
  const scores = [entityMatchScore(polyMarket.text, entity), ...(polyMarket.outcomes || []).map((outcome) => entityMatchScore(outcome, entity))];
  return scores.sort((a, b) => b.score - a.score)[0] || { matched: false, score: 0, reason: "not checked" };
}

function entityMentioned(text = "", entity = "") {
  return entityMatchScore(text, entity).matched;
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

async function fetchPolymarket(env, path) {
  const headers = { accept: "application/json", "user-agent": "TennisTipz-Arbitrage/1.0" };
  if (env.POLYMARKET_API_KEY) headers.authorization = `Bearer ${env.POLYMARKET_API_KEY}`;
  const response = await fetch(`${POLYMARKET_GAMMA_API_BASE}${path}`, { headers });
  if (!response.ok) throw new Error(`Polymarket ${path} returned ${response.status}`);
  return response.json();
}

function competitionText(competition = {}) {
  return [competition.name, competition.key, competition.category?.name, competition.category?.key].filter(Boolean).join(" ");
}

function eventText(event = {}) {
  return [event.name, event.key, event.home?.name, event.away?.name, competitionText(event.competition || {})].filter(Boolean).join(" ");
}

function polymarketCompetitionHints(market = {}) {
  const hints = new Set(POLYMARKET_COMPETITION_HINTS[market.seriesSlug] || []);
  const text = normalizeName([market.seriesSlug, market.question, market.title].filter(Boolean).join(" "));
  for (const [seriesSlug, values] of Object.entries(POLYMARKET_COMPETITION_HINTS)) {
    if (includesNormalizedPhrase(text, normalizeName(seriesSlug))) values.forEach((hint) => hints.add(hint));
  }
  return [...hints].map(normalizeName).filter(Boolean);
}

function competitionHintScore(competition = {}, hints = []) {
  if (!hints.length) return 0;
  const text = normalizeName(competitionText(competition));
  const textTokens = new Set(normalizedTokens(competitionText(competition)));
  return hints.reduce((score, hint) => {
    const hintTokens = normalizedTokens(hint);
    const exactPhrase = includesNormalizedPhrase(text, hint);
    const singleTokenExact = hintTokens.length === 1 && textTokens.has(hintTokens[0]);
    return exactPhrase || singleTokenExact ? score + 3 : score;
  }, 0);
}

function selectCloudbetCompetitions(competitions = [], options = {}) {
  const hints = (options.competitionHints || []).map(normalizeName).filter(Boolean);
  const ranked = competitions
    .map((competition) => ({ competition, hintScore: competitionHintScore(competition, hints) }))
    .sort((a, b) => b.hintScore - a.hintScore || (b.competition.eventCount || 0) - (a.competition.eventCount || 0));
  const hinted = ranked.filter((item) => item.hintScore > 0);
  if (hints.length && !hinted.length) return [];
  const selected = (hinted.length ? hinted : ranked).slice(0, hinted.length ? Math.min(options.competitionLimitPerSport || 8, 8) : options.competitionLimitPerSport);
  return selected.map((item) => item.competition);
}

function hasNormalizedPhrase(text = "", phrase = "") {
  return includesNormalizedPhrase(normalizeName(text), normalizeName(phrase));
}

function cloudbetEventSeriesSlugs(event = {}) {
  const text = [event.sportKey, event.sport, event.competition, event.home, event.away].filter(Boolean).join(" ");
  const slugs = new Set();

  if (hasNormalizedPhrase(text, "mlb")) slugs.add("mlb");
  if (hasNormalizedPhrase(text, "wnba")) slugs.add("wnba");
  else if (hasNormalizedPhrase(text, "nba")) slugs.add("nba");
  if (hasNormalizedPhrase(text, "nfl")) slugs.add("nfl");
  if (hasNormalizedPhrase(text, "ncaaf") || hasNormalizedPhrase(text, "ncaa football") || hasNormalizedPhrase(text, "college football")) slugs.add("ncaaf");
  if (hasNormalizedPhrase(text, "ncaab") || hasNormalizedPhrase(text, "ncaa basketball") || hasNormalizedPhrase(text, "college basketball")) slugs.add("ncaab");
  if (hasNormalizedPhrase(text, "nhl")) slugs.add("nhl");
  if (hasNormalizedPhrase(text, "ufc")) slugs.add("ufc");
  if (hasNormalizedPhrase(text, "mma")) slugs.add("mma");
  if (hasNormalizedPhrase(text, "premier league") || hasNormalizedPhrase(text, "epl")) slugs.add("epl");
  if (hasNormalizedPhrase(text, "mls")) slugs.add("mls");
  if (hasNormalizedPhrase(text, "champions league")) slugs.add("champions-league");
  if (hasNormalizedPhrase(text, "atp") || hasNormalizedPhrase(text, "wta") || hasNormalizedPhrase(text, "grand slam") || hasNormalizedPhrase(text, "tennis")) slugs.add("tennis");

  return [...slugs];
}

function rawPolymarketEventMatchesCloudbet(event = {}, cloudbetEvent = {}) {
  const text = [event.title, event.name, event.slug, event.ticker, event.description].filter(Boolean).join(" ");
  const homeScore = entityMatchScore(text, cloudbetEvent.home);
  const awayScore = entityMatchScore(text, cloudbetEvent.away);
  return homeScore.matched && awayScore.matched;
}

function eventStartIso(event = {}) {
  const raw = event.startTime || event.cutoffTime || event.startDate || event.start || event.scheduledStart || event.commenceTime || event.date;
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function toIsoString(value = "") {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
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

function selectionText(selection = {}) {
  return [selection.outcome, selection.name, selection.label, selection.title, selection.params].filter(Boolean).join(" ");
}

function looksLikeWinnerMarket(marketKey = "", market = {}) {
  const text = [marketKey, market.name, market.title, market.description].filter(Boolean).join(" ");
  if (BAD_BINARY_MARKET_RE.test(text)) return false;
  return GOOD_BINARY_MARKET_RE.test(text) || String(marketKey).toLowerCase().endsWith(".winner");
}

function extractGenericBinaryCloudbetOdds(event = {}) {
  if (!event?.home?.name || !event?.away?.name || !isCloudbetUpcoming(event)) return null;
  const markets = event.markets || {};
  for (const [marketKey, market] of Object.entries(markets)) {
    if (!looksLikeWinnerMarket(marketKey, market)) continue;
    const selections = cloudbetSelectionsFromMarket(market).filter(cloudbetSelectionEnabled);
    if (selections.length !== 2) continue;
    if (selections.some((selection) => /\b(draw|tie|x)\b/i.test(selectionText(selection)))) continue;

    let homeSelection = selections.find((selection) => cloudbetSelectionMatches(selection, "home", event.home.name) || entityMentioned(selectionText(selection), event.home.name));
    let awaySelection = selections.find((selection) => cloudbetSelectionMatches(selection, "away", event.away.name) || entityMentioned(selectionText(selection), event.away.name));
    if ((!homeSelection || !awaySelection) && selections.length === 2) [homeSelection, awaySelection] = selections;

    const home = asPrice(homeSelection?.price || homeSelection?.odds);
    const away = asPrice(awaySelection?.price || awaySelection?.odds);
    if (home && away) {
      return {
        home,
        away,
        homeName: event.home.name,
        awayName: event.away.name,
        marketKey,
        marketType: market.name || market.title || marketKey,
      };
    }
  }
  return null;
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

function normalizeCloudbetSports(payload) {
  const rawSports = Array.isArray(payload?.sports) ? payload.sports : Array.isArray(payload) ? payload : [];
  return rawSports
    .map((sport) => ({
      key: String(sport.key || sport.slug || sport.id || sport.name || "").trim(),
      name: String(sport.name || sport.title || sport.key || sport.slug || sport.id || "").trim(),
    }))
    .filter((sport) => sport.key && !CROSS_SPORT_BLOCKED_RE.test(`${sport.key} ${sport.name}`));
}

async function getCloudbetSports(env, options = {}) {
  const configured = String(env.CLOUDBET_ARB_SPORTS || "").split(",").map((sport) => sport.trim()).filter(Boolean);
  if (configured.length) return configured.slice(0, options.sportLimit).map((key) => ({ key, name: key }));
  const preferred = Array.isArray(options.preferredCloudbetSports) ? options.preferredCloudbetSports.filter(Boolean) : [];
  if (preferred.length) return [...new Set(preferred)].slice(0, options.sportLimit).map((key) => ({ key, name: key }));
  const payload = await fetchCloudbet(env, "/sports").catch(() => null);
  const sports = normalizeCloudbetSports(payload);
  if (sports.length) {
    const priority = new Map(DEFAULT_CLOUDBET_SPORTS.map((key, index) => [key, index]));
    return sports
      .sort((a, b) => (priority.get(a.key) ?? 999) - (priority.get(b.key) ?? 999) || a.name.localeCompare(b.name))
      .slice(0, options.sportLimit);
  }
  return DEFAULT_CLOUDBET_SPORTS.slice(0, options.sportLimit).map((key) => ({ key, name: key }));
}

async function getCloudbetAllSportEvents(env, options = {}) {
  const diagnostics = {
    hasCloudbetApiKey: Boolean(env.CLOUDBET_API_KEY),
    sportsScanned: 0,
    competitionsScanned: 0,
    eventsScanned: 0,
    pricedEvents: 0,
    competitionHints: options.competitionHints || [],
    selectedCompetitions: [],
    errors: [],
  };
  if (!env.CLOUDBET_API_KEY) return { events: [], diagnostics };

  const sports = await getCloudbetSports(env, options);
  const events = [];
  let remainingCompetitionFetches = options.cloudbetCompetitionFetchLimit || 18;
  diagnostics.sportsScanned = sports.length;

  for (const sport of sports) {
    if (remainingCompetitionFetches <= 0) break;
    try {
      const sportPayload = await fetchCloudbet(env, `/sports/${encodeURIComponent(sport.key)}`);
      const rawCompetitions = (sportPayload?.categories || [])
        .flatMap((category) => (category.competitions || []).map((competition) => ({ ...competition, category })))
        .filter((competition) => competition.eventCount > 0)
        .filter((competition) => !CROSS_SPORT_BLOCKED_RE.test(competitionText(competition)));
      const hasCompetitionHints = Array.isArray(options.competitionHints) && options.competitionHints.length > 0;
      const perSportCompetitionLimit = hasCompetitionHints
        ? options.competitionLimitPerSport || 8
        : Math.min(options.competitionLimitPerSport || 8, options.cloudbetCompetitionsPerSportLimit || 3);
      const competitions = selectCloudbetCompetitions(rawCompetitions, {
        ...options,
        competitionLimitPerSport: Math.min(perSportCompetitionLimit, remainingCompetitionFetches),
      });
      diagnostics.competitionsScanned += competitions.length;
      diagnostics.selectedCompetitions.push(...competitions.slice(0, 12).map((competition) => competition.key || competition.name));
      remainingCompetitionFetches -= competitions.length;

      const payloads = [];
      for (let i = 0; i < competitions.length; i += 8) {
        payloads.push(...await Promise.all(competitions.slice(i, i + 8).map(async (competition) => ({
          competition,
          payload: await fetchCloudbet(env, `/competitions/${competition.key}`).catch((error) => {
            diagnostics.errors.push(`${competition.key}: ${error.message}`);
            return null;
          }),
        }))));
      }

      const rawEvents = payloads.flatMap(({ competition, payload }) => (payload?.events || []).map((event) => ({ ...event, sport, competition: event.competition || competition })));
      diagnostics.eventsScanned += rawEvents.length;
      for (const event of rawEvents) {
        if (events.length >= options.eventLimit) break;
        if (CROSS_SPORT_BLOCKED_RE.test(eventText(event))) continue;
        const odds = extractGenericBinaryCloudbetOdds(event);
        if (!odds) continue;
        events.push({
          id: String(event.id || event.key || `${sport.key}-${event.home.name}-${event.away.name}`),
          sport: sport.name || sport.key,
          sportKey: sport.key,
          competition: event.competition?.name || event.name || sport.name || "Sport",
          startIso: eventStartIso(event),
          home: event.home.name,
          away: event.away.name,
          odds,
        });
      }
      if (events.length >= options.eventLimit) break;
    } catch (error) {
      diagnostics.errors.push(`${sport.key}: ${error.message}`);
    }
  }

  diagnostics.pricedEvents = events.length;
  return { events, diagnostics };
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

function polymarketList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.markets)) return payload.markets;
  return [];
}

function polymarketMarketUrl(market = {}, event = {}) {
  const eventSlug = event.slug || market.eventSlug || market.event_slug;
  const marketSlug = market.slug || market.market_slug;
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  if (marketSlug) return `https://polymarket.com/market/${marketSlug}`;
  return "https://polymarket.com";
}

function normalizePolymarketMarket(rawMarket = {}, event = {}) {
  const outcomes = safeJsonArray(rawMarket.outcomes);
  const prices = safeJsonArray(rawMarket.outcomePrices || rawMarket.outcome_prices);
  if (outcomes.length !== 2 || prices.length !== 2) return null;
  const firstPrice = parseProbability(prices[0]);
  const secondPrice = parseProbability(prices[1]);
  if (!firstPrice || !secondPrice) return null;
  const question = rawMarket.question || rawMarket.title || event.title || event.name || "";
  const title = event.title || event.name || question;
  const text = [question, title, event.slug, rawMarket.slug, rawMarket.description, event.description].filter(Boolean).join(" ");
  if (CROSS_SPORT_BLOCKED_RE.test(text)) return null;
  if (BAD_BINARY_MARKET_RE.test(text)) return null;
  const startIso = toIsoString(
    event.startTime
      || event.startDate
      || event.startDateIso
      || event.start_time
      || event.start_date_iso
      || rawMarket.startDate
      || rawMarket.startDateIso
      || rawMarket.start_time
  );
  const endDate = toIsoString(
    rawMarket.endDate
      || rawMarket.end_date_iso
      || rawMarket.endDateIso
      || event.endDate
      || event.end_date_iso
      || event.endDateIso
  );
  return {
    id: String(rawMarket.id || rawMarket.conditionId || rawMarket.condition_id || rawMarket.slug || question),
    seriesSlug: event.seriesSlug || event.series_slug || rawMarket.seriesSlug || rawMarket.series_slug || "",
    question,
    title,
    text,
    slug: rawMarket.slug || rawMarket.market_slug || "",
    eventSlug: event.slug || rawMarket.eventSlug || rawMarket.event_slug || "",
    startIso,
    endDate,
    url: polymarketMarketUrl(rawMarket, event),
    outcomes: outcomes.map(String),
    prices: [firstPrice, secondPrice],
    volume: Number(rawMarket.volume || rawMarket.volumeNum || event.volume || 0) || 0,
  };
}

function isOpenPolymarketSportsEvent(event = {}) {
  if (!event || event.closed || event.ended || event.archived || event.active === false) return false;
  const date = new Date(event.startTime || event.endDate || event.endDateIso || event.startDate || event.creationDate || 0);
  if (Number.isNaN(date.getTime())) return true;
  const now = Date.now();
  return date.getTime() >= now - 1000 * 60 * 60 * 36;
}

function eventMarketsFromPayload(payload) {
  const events = polymarketList(payload);
  if (!events.length && payload?.markets) return payload.markets;
  return events.flatMap((event) => (Array.isArray(event.markets) ? event.markets.map((market) => ({ market, event })) : []));
}

async function hydratePolymarketEventMarkets(env, event, diagnostics) {
  const slugs = [event.slug, event.ticker].filter(Boolean);
  for (const slug of slugs) {
    try {
      const payload = await fetchPolymarket(env, `/events?slug=${encodeURIComponent(slug)}`);
      const pairs = eventMarketsFromPayload(payload);
      if (pairs.length) return pairs;
    } catch (error) {
      diagnostics.errors.push(`event ${slug}: ${error.message}`);
    }
  }
  if (Array.isArray(event.markets)) return event.markets.map((market) => ({ market, event }));
  return [];
}

async function getPolymarketBinaryMarkets(env, options = {}) {
  const diagnostics = {
    hasPolymarketApiKey: Boolean(env.POLYMARKET_API_KEY),
    endpointsTried: [],
    seriesScanned: 0,
    eventsDiscovered: 0,
    eventsHydrated: 0,
    marketsScanned: 0,
    binaryMarkets: 0,
    sportSeries: [],
    errors: [],
  };
  const seriesSlugs = String(env.POLYMARKET_SPORT_SERIES || "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
  const slugs = (seriesSlugs.length ? seriesSlugs : POLYMARKET_SPORT_SERIES).slice(0, options.polymarketSeriesLimit);
  const normalized = [];
  const seen = new Set();
  const sports = new Set();
  const marketSports = new Set();
  const competitionHints = new Set();

  for (const slug of slugs) {
    if (diagnostics.eventsHydrated >= options.polymarketEventLimit) break;
    const endpoint = `/series?slug=${encodeURIComponent(slug)}`;
    diagnostics.endpointsTried.push(endpoint);
    try {
      const payload = await fetchPolymarket(env, endpoint);
      const series = polymarketList(payload);
      diagnostics.seriesScanned += series.length;
      for (const item of series) {
        const seriesSlug = item.slug || slug;
        const events = (Array.isArray(item.events) ? item.events : [])
          .filter(isOpenPolymarketSportsEvent)
          .slice(0, options.polymarketEventsPerSeries);
        diagnostics.eventsDiscovered += events.length;
        if (events.length) {
          diagnostics.sportSeries.push({ slug: seriesSlug, title: item.title || seriesSlug, events: events.length });
          sports.add(seriesSlug);
        }
        for (const event of events) {
          if (diagnostics.eventsHydrated >= options.polymarketEventLimit) break;
          diagnostics.eventsHydrated += 1;
          const pairs = await hydratePolymarketEventMarkets(env, { ...event, seriesSlug }, diagnostics);
          for (const { market, event: marketEvent } of pairs) {
          diagnostics.marketsScanned += 1;
          const candidate = normalizePolymarketMarket(market, { ...event, ...marketEvent, seriesSlug });
          if (!candidate || seen.has(candidate.id)) continue;
          seen.add(candidate.id);
          normalized.push(candidate);
          marketSports.add(candidate.seriesSlug);
          polymarketCompetitionHints(candidate).forEach((hint) => competitionHints.add(hint));
          }
        }
      }
    } catch (error) {
      diagnostics.errors.push(`${endpoint}: ${error.message}`);
    }
  }

  diagnostics.binaryMarkets = normalized.length;
  diagnostics.competitionHints = [...competitionHints];
  diagnostics.marketSeries = [...marketSports];
  const cloudbetSports = [...marketSports].flatMap((sport) => POLYMARKET_TO_CLOUDBET_SPORTS[sport] || []);
  return { markets: normalized, cloudbetSports: [...new Set(cloudbetSports)], competitionHints: [...competitionHints], diagnostics };
}

async function getPolymarketBinaryMarketsForCloudbetEvents(env, cloudbetEvents = [], options = {}) {
  const diagnostics = {
    hasPolymarketApiKey: Boolean(env.POLYMARKET_API_KEY),
    strategy: "cloudbet-first",
    endpointsTried: [],
    seriesInferred: [],
    seriesScanned: 0,
    eventsDiscovered: 0,
    eventsRelevant: 0,
    eventsHydrated: 0,
    marketsScanned: 0,
    binaryMarkets: 0,
    sportSeries: [],
    errors: [],
  };
  const seriesToCloudbetEvents = new Map();
  for (const cloudbetEvent of cloudbetEvents) {
    for (const slug of cloudbetEventSeriesSlugs(cloudbetEvent)) {
      if (!seriesToCloudbetEvents.has(slug)) seriesToCloudbetEvents.set(slug, []);
      seriesToCloudbetEvents.get(slug).push(cloudbetEvent);
    }
  }

  const slugs = [...seriesToCloudbetEvents.keys()].slice(0, options.polymarketSeriesLimit);
  diagnostics.seriesInferred = slugs.map((slug) => ({ slug, cloudbetEvents: seriesToCloudbetEvents.get(slug)?.length || 0 }));

  const normalized = [];
  const seen = new Set();
  for (const slug of slugs) {
    if (diagnostics.eventsHydrated >= options.polymarketEventLimit) break;
    const cloudbetForSeries = seriesToCloudbetEvents.get(slug) || [];
    const endpoint = `/series?slug=${encodeURIComponent(slug)}`;
    diagnostics.endpointsTried.push(endpoint);
    try {
      const payload = await fetchPolymarket(env, endpoint);
      const series = polymarketList(payload);
      diagnostics.seriesScanned += series.length;
      for (const item of series) {
        const events = (Array.isArray(item.events) ? item.events : []).filter(isOpenPolymarketSportsEvent);
        const relevantEvents = events
          .filter((event) => cloudbetForSeries.some((cloudbetEvent) => rawPolymarketEventMatchesCloudbet(event, cloudbetEvent)))
          .slice(0, options.polymarketEventsPerSeries);
        diagnostics.eventsDiscovered += events.length;
        diagnostics.eventsRelevant += relevantEvents.length;
        diagnostics.sportSeries.push({
          slug: item.slug || slug,
          title: item.title || slug,
          events: events.length,
          relevantEvents: relevantEvents.length,
        });

        for (const event of relevantEvents) {
          if (diagnostics.eventsHydrated >= options.polymarketEventLimit) break;
          diagnostics.eventsHydrated += 1;
          const pairs = await hydratePolymarketEventMarkets(env, { ...event, seriesSlug: item.slug || slug }, diagnostics);
          for (const { market, event: marketEvent } of pairs) {
            diagnostics.marketsScanned += 1;
            const candidate = normalizePolymarketMarket(market, { ...event, ...marketEvent, seriesSlug: item.slug || slug });
            if (!candidate || seen.has(candidate.id)) continue;
            const matchesCloudbetEvent = cloudbetForSeries.some((cloudbetEvent) => polymarketCloudbetAnalysis(candidate, cloudbetEvent).teamsMatched);
            if (!matchesCloudbetEvent) continue;
            seen.add(candidate.id);
            normalized.push(candidate);
          }
        }
      }
    } catch (error) {
      diagnostics.errors.push(`${endpoint}: ${error.message}`);
    }
  }

  diagnostics.binaryMarkets = normalized.length;
  diagnostics.marketSeries = slugs;
  return { markets: normalized, cloudbetSports: [], competitionHints: [], diagnostics };
}

function eventDateGapHours(cloudbetEvent = {}, polyMarket = {}) {
  const polyDate = polyMarket.startIso || polyMarket.endDate;
  if (!cloudbetEvent.startIso || !polyDate) return null;
  const left = new Date(cloudbetEvent.startIso).getTime();
  const right = new Date(polyDate).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.round((Math.abs(left - right) / (1000 * 60 * 60)) * 10) / 10;
}

function eventDatesClose(cloudbetEvent = {}, polyMarket = {}) {
  const gapHours = eventDateGapHours(cloudbetEvent, polyMarket);
  return gapHours === null || gapHours <= SAME_EVENT_MAX_HOURS;
}

function entityFirstIndex(text = "", entity = "") {
  const normalizedText = normalizeName(text);
  const normalizedEntity = normalizeName(entity);
  if (!normalizedText || !normalizedEntity) return -1;
  const phraseIndex = ` ${normalizedText} `.indexOf(` ${normalizedEntity} `);
  if (phraseIndex >= 0) return phraseIndex;

  const textTokens = normalizedTokens(text);
  const entityTokens = importantTokens(entity);
  const priorityTokens = [...new Set([entityTokens.at(-1), ...entityTokens].filter((token) => token && token.length >= 3 && !GENERIC_ENTITY_TOKENS.has(token)))];
  const indexes = priorityTokens
    .map((token) => textTokens.indexOf(token))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function polymarketCloudbetAnalysis(polyMarket = {}, cloudbetEvent = {}) {
  const homeScore = bestEntityMatchScore(polyMarket, cloudbetEvent.home);
  const awayScore = bestEntityMatchScore(polyMarket, cloudbetEvent.away);
  const dateGapHours = eventDateGapHours(cloudbetEvent, polyMarket);
  const dateClose = eventDatesClose(cloudbetEvent, polyMarket);
  return {
    homeScore,
    awayScore,
    teamsMatched: homeScore.matched && awayScore.matched,
    dateClose,
    dateGapHours,
    combinedScore: Math.round((homeScore.score + awayScore.score) * 100) / 100,
  };
}

function nearMatchReason(analysis = {}) {
  if (analysis.teamsMatched && !analysis.dateClose) return `same teams, date gap ${analysis.dateGapHours ?? "unknown"}h`;
  if (!analysis.teamsMatched && analysis.dateClose) return `same date window, weak team score ${analysis.homeScore?.score ?? 0}/${analysis.awayScore?.score ?? 0}`;
  return `weak match score ${analysis.homeScore?.score ?? 0}/${analysis.awayScore?.score ?? 0}`;
}

function inferPolymarketSides(polyMarket = {}, cloudbetEvent = {}) {
  const [firstOutcome, secondOutcome] = polyMarket.outcomes;
  const [firstPrice, secondPrice] = polyMarket.prices;
  const firstText = firstOutcome || "";
  const secondText = secondOutcome || "";

  if (entityMentioned(firstText, cloudbetEvent.home) && entityMentioned(secondText, cloudbetEvent.away)) {
    return { homePrice: firstPrice, awayPrice: secondPrice, matchType: "outcome names" };
  }
  if (entityMentioned(firstText, cloudbetEvent.away) && entityMentioned(secondText, cloudbetEvent.home)) {
    return { homePrice: secondPrice, awayPrice: firstPrice, matchType: "outcome names reversed" };
  }

  const yesNo = normalizeName(firstOutcome) === "yes" && normalizeName(secondOutcome) === "no";
  if (!yesNo) return null;
  const homeMentioned = entityMentioned(polyMarket.text, cloudbetEvent.home);
  const awayMentioned = entityMentioned(polyMarket.text, cloudbetEvent.away);
  if (!homeMentioned || !awayMentioned) return null;

  const normalizedText = normalizeName(polyMarket.text);
  const homeIndex = entityFirstIndex(normalizedText, cloudbetEvent.home);
  const awayIndex = entityFirstIndex(normalizedText, cloudbetEvent.away);
  if (homeIndex < 0 || awayIndex < 0) return null;

  if (homeIndex < awayIndex) return { homePrice: firstPrice, awayPrice: secondPrice, matchType: "yes/no first-mentioned home" };
  return { homePrice: secondPrice, awayPrice: firstPrice, matchType: "yes/no first-mentioned away" };
}

function polymarketCloudbetMatch(polyMarket = {}, cloudbetEvent = {}) {
  const analysis = polymarketCloudbetAnalysis(polyMarket, cloudbetEvent);
  if (!analysis.teamsMatched || !analysis.dateClose) return null;
  const sides = inferPolymarketSides(polyMarket, cloudbetEvent);
  if (!sides) return null;
  return { ...sides, dateGapHours: analysis.dateGapHours, homeScore: analysis.homeScore.score, awayScore: analysis.awayScore.score };
}

function buildPolymarketCoverage(polymarketMarkets = [], cloudbetEvents = []) {
  return polymarketMarkets.map((polyMarket) => {
    const candidates = [];
    const nearCandidates = [];
    for (const cloudbetEvent of cloudbetEvents) {
      const analysis = polymarketCloudbetAnalysis(polyMarket, cloudbetEvent);
      const sides = polymarketCloudbetMatch(polyMarket, cloudbetEvent);
      const entry = {
        id: cloudbetEvent.id,
        match: `${cloudbetEvent.home} vs ${cloudbetEvent.away}`,
        sport: cloudbetEvent.sport,
        competition: cloudbetEvent.competition,
        startIso: cloudbetEvent.startIso,
        dateGapHours: analysis.dateGapHours,
        homeScore: analysis.homeScore.score,
        awayScore: analysis.awayScore.score,
      };
      if (sides) {
        candidates.push({
          ...entry,
          marketMatchType: sides.matchType,
          cloudbetHomeOdds: cloudbetEvent.odds.home,
          cloudbetAwayOdds: cloudbetEvent.odds.away,
        });
      } else if (analysis.teamsMatched || (analysis.dateClose && analysis.combinedScore >= 1.2)) {
        nearCandidates.push({ ...entry, reason: nearMatchReason(analysis) });
      }
    }
    return {
      id: polyMarket.id,
      question: polyMarket.question,
      seriesSlug: polyMarket.seriesSlug,
      startIso: polyMarket.startIso,
      endDate: polyMarket.endDate,
      url: polyMarket.url,
      outcomes: polyMarket.outcomes,
      prices: polyMarket.prices,
      matched: candidates.length > 0,
      candidates: candidates.slice(0, 3),
      nearCandidates: nearCandidates.sort((a, b) => (a.dateGapHours ?? 9999) - (b.dateGapHours ?? 9999) || (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore)).slice(0, 3),
    };
  });
}

function buildCrossVenueCandidate(cloudbetEvent, polyMarket, sides, cloudbetSide, bankroll, polyBuffer, cloudbetAffiliateUrl) {
  const opposite = cloudbetSide === "home" ? "away" : "home";
  const cloudbetPrice = cloudbetEvent.odds[cloudbetSide];
  const rawPolyPrice = sides[`${opposite}Price`];
  if (!cloudbetPrice || !rawPolyPrice) return null;
  const polyPrice = Math.min(0.99, Math.round((rawPolyPrice + polyBuffer) * 10000) / 10000);
  const impliedTotal = (1 / cloudbetPrice) + polyPrice;
  const edgePercent = (1 - impliedTotal) * 100;
  const cloudbetStake = bankroll / (1 + cloudbetPrice * polyPrice);
  const polymarketShares = cloudbetStake * cloudbetPrice;
  const polymarketCost = polymarketShares * polyPrice;
  const expectedProfit = polymarketShares - bankroll;

  return {
    eventKey: `cross-${cloudbetEvent.id}-${polyMarket.id}-${cloudbetSide}`,
    sport: cloudbetEvent.sport,
    competition: cloudbetEvent.competition,
    match: `${cloudbetEvent.home} vs ${cloudbetEvent.away}`,
    startIso: cloudbetEvent.startIso,
    cloudbetSide,
    cloudbetPick: cloudbetSide === "home" ? cloudbetEvent.home : cloudbetEvent.away,
    polymarketPick: opposite === "home" ? cloudbetEvent.home : cloudbetEvent.away,
    cloudbetOdds: cloudbetPrice,
    polymarketPrice: polyPrice,
    polymarketRawPrice: rawPolyPrice,
    polymarketQuestion: polyMarket.question,
    polymarketUrl: polyMarket.url,
    cloudbetUrl: cloudbetAffiliateUrl,
    marketMatchType: sides.matchType,
    arbitrage: impliedTotal < 1,
    impliedTotal: Math.round(impliedTotal * 10000) / 10000,
    edgePercent: Math.round(edgePercent * 100) / 100,
    stakePlan: {
      bankroll,
      cloudbetStake: Math.round(cloudbetStake * 100) / 100,
      polymarketCost: Math.round(polymarketCost * 100) / 100,
      polymarketShares: Math.round(polymarketShares * 100) / 100,
      expectedProfit: Math.round(expectedProfit * 100) / 100,
      expectedReturnPercent: Math.round((expectedProfit / bankroll) * 10000) / 100,
    },
  };
}

async function scanCrossSportArbitrage(env, options = {}) {
  const cloudbet = await getCloudbetAllSportEvents(env, options)
    .catch((error) => ({ events: [], diagnostics: { error: error.message, hasCloudbetApiKey: Boolean(env.CLOUDBET_API_KEY) } }));
  const polymarket = await getPolymarketBinaryMarketsForCloudbetEvents(env, cloudbet.events, options)
    .catch((error) => ({ markets: [], cloudbetSports: [], diagnostics: { error: error.message, hasPolymarketApiKey: Boolean(env.POLYMARKET_API_KEY), strategy: "cloudbet-first" } }));
  const cloudbetAffiliateUrl = (env.CLOUDBET_AFFILIATE_URL || DEFAULT_CLOUDBET_AFFILIATE_URL).trim();
  const checked = [];
  const opportunities = [];
  let matchedMarkets = 0;
  const polymarketCoverage = buildPolymarketCoverage(polymarket.markets, cloudbet.events);

  for (const cloudbetEvent of cloudbet.events) {
    const eventMatches = [];
    const nearMatches = [];
    for (const polyMarket of polymarket.markets) {
      const sides = polymarketCloudbetMatch(polyMarket, cloudbetEvent);
      if (!sides) {
        const analysis = polymarketCloudbetAnalysis(polyMarket, cloudbetEvent);
        if (analysis.teamsMatched || (analysis.dateClose && analysis.combinedScore >= 1.2)) {
          nearMatches.push({ question: polyMarket.question, reason: nearMatchReason(analysis), dateGapHours: analysis.dateGapHours });
        }
        continue;
      }
      matchedMarkets += 1;
      eventMatches.push(polyMarket.question);
      for (const side of ["home", "away"]) {
        const candidate = buildCrossVenueCandidate(cloudbetEvent, polyMarket, sides, side, options.bankroll, options.polyBuffer, cloudbetAffiliateUrl);
        if (candidate) opportunities.push(candidate);
      }
    }
    checked.push({
      eventKey: cloudbetEvent.id,
      match: `${cloudbetEvent.home} vs ${cloudbetEvent.away}`,
      sport: cloudbetEvent.sport,
      competition: cloudbetEvent.competition,
      startIso: cloudbetEvent.startIso,
      polymarketMatches: eventMatches.slice(0, 3),
      polymarketNearMatches: nearMatches.slice(0, 3),
    });
  }

  return {
    cloudbetEventsScanned: cloudbet.events.length,
    polymarketMarketsScanned: polymarket.markets.length,
    matchedMarkets,
    opportunities,
    checked,
    polymarketCoverage,
    cloudbetDiagnostics: cloudbet.diagnostics,
    polymarketDiagnostics: polymarket.diagnostics,
  };
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

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "cross-sport" ? "cross-sport" : "tennis";
  const options = {
    dateStart: url.searchParams.get("date_start") || isoDate(0),
    dateStop: url.searchParams.get("date_stop") || isoDate(7),
    scanLimit: clampInteger(url.searchParams.get("scan") || "40", 40, 1, mode === "cross-sport" ? 250 : 80),
    bankroll: clampNumber(url.searchParams.get("bankroll") || "100", 100, 1, 100000),
    sportLimit: clampInteger(url.searchParams.get("sports") || env.CLOUDBET_ARB_SPORT_LIMIT || "10", 10, 1, 20),
    competitionLimitPerSport: clampInteger(url.searchParams.get("competitions") || env.CLOUDBET_ARB_COMPETITION_LIMIT || "16", 16, 1, 40),
    cloudbetCompetitionFetchLimit: clampInteger(url.searchParams.get("cloudbet_competitions_total") || env.CLOUDBET_ARB_COMPETITION_FETCH_LIMIT || "18", 18, 1, 40),
    cloudbetCompetitionsPerSportLimit: clampInteger(url.searchParams.get("cloudbet_competitions_per_sport") || env.CLOUDBET_ARB_COMPETITIONS_PER_SPORT || "3", 3, 1, 10),
    eventLimit: clampInteger(url.searchParams.get("events") || url.searchParams.get("scan") || "80", 80, 1, 250),
    polymarketLimit: clampInteger(url.searchParams.get("polymarket") || env.POLYMARKET_ARB_MARKET_LIMIT || "500", 500, 25, 1000),
    polymarketSeriesLimit: clampInteger(url.searchParams.get("poly_series") || env.POLYMARKET_ARB_SERIES_LIMIT || "10", 10, 1, 20),
    polymarketEventsPerSeries: clampInteger(url.searchParams.get("poly_events_per_series") || env.POLYMARKET_ARB_EVENTS_PER_SERIES || "6", 6, 1, 20),
    polymarketEventLimit: clampInteger(url.searchParams.get("poly_events") || env.POLYMARKET_ARB_EVENT_LIMIT || "30", 30, 1, 80),
    polyBuffer: clampNumber(url.searchParams.get("poly_buffer") || env.POLYMARKET_PRICE_BUFFER || "0.01", 0.01, 0, 0.1),
  };

  if (mode === "cross-sport") {
    if (!env.CLOUDBET_API_KEY) return jsonResponse({ ok: false, error: "Missing CLOUDBET_API_KEY" }, 500);
    const cross = await scanCrossSportArbitrage(env, options);
    const rows = cross.opportunities
      .sort((a, b) => Number(b.arbitrage) - Number(a.arbitrage) || b.edgePercent - a.edgePercent)
      .slice(0, 100);
    return jsonResponse({
      ok: true,
      mode,
      generatedAt: new Date().toISOString(),
      source: "Cloudbet current sport events + matched Polymarket active binary markets",
      memberOnly: true,
      authType: auth.type,
      member: auth.member ? { email: auth.member.email, name: auth.member.name || "" } : null,
      options,
      summary: {
        cloudbetEventsScanned: cross.cloudbetEventsScanned,
        polymarketMarketsScanned: cross.polymarketMarketsScanned,
        matchedMarkets: cross.matchedMarkets,
        polymarketMatched: cross.polymarketCoverage.filter((item) => item.matched).length,
        polymarketUnmatched: cross.polymarketCoverage.filter((item) => !item.matched).length,
        pricedMatches: rows.length,
        arbitrageCount: rows.filter((item) => item.arbitrage).length,
        bestEdgePercent: rows.length ? rows[0].edgePercent : null,
      },
      opportunities: rows,
      checked: cross.checked.slice(0, 80),
      polymarketCoverage: cross.polymarketCoverage.slice(0, 100),
      cloudbetDiagnostics: cross.cloudbetDiagnostics,
      polymarketDiagnostics: cross.polymarketDiagnostics,
      note: "Cross-venue arbitrage is theoretical before odds latency, order-book depth, Polymarket spreads/fees, stake limits, void rules, KYC restrictions and settlement-rule differences. Recheck every price manually before acting.",
    });
  }

  if (!env.API_TENNIS_KEY) return jsonResponse({ ok: false, error: "Missing API_TENNIS_KEY" }, 500);

  const upcoming = await scanUpcomingFixtures(env, options);
  const rows = upcoming.opportunities
    .sort((a, b) => Number(b.arbitrage) - Number(a.arbitrage) || b.edgePercent - a.edgePercent)
    .slice(0, 80);

  return jsonResponse({
    ok: true,
    mode,
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
