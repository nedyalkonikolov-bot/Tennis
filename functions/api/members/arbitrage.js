const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const CLOUDBET_API_BASE = "https://sports-api.cloudbet.com/pub/v2/odds";
const POLYMARKET_GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOUDBET_MARKETS_QUERY = "?markets=tennis.winner&markets=tennis.winner_and_total";
const DEFAULT_CLOUDBET_AFFILIATE_URL = "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Arbitrage&aftm_cid=4";
const BLOCKED_RE = /\b(simulated|simulation|virtual|srl|reality league|itf|utr|exhibition|junior|boys|girls|college|doubles)\b/i;
const CROSS_SPORT_BLOCKED_RE = /\b(simulated|simulation|virtual|srl|reality league|esoccer|ebasketball|efootball|specials|politics|finance|crypto|weather)\b/i;
const DEFAULT_CLOUDBET_SPORTS = ["tennis", "soccer", "basketball", "baseball", "american-football", "ice-hockey", "boxing", "mma", "cricket", "rugby"];
const POLYMARKET_SPORT_SERIES = ["atp", "wta", "mlb", "wnba", "nba", "nfl", "ncaaf", "ncaab", "nhl", "tennis", "ufc", "mma", "epl", "mls", "champions-league"];
const POLYMARKET_TO_CLOUDBET_SPORTS = {
  atp: ["tennis"],
  wta: ["tennis"],
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
  atp: ["atp", "challenger", "men singles"],
  wta: ["wta", "women singles"],
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
const BAD_BINARY_MARKET_RE = /\b(completed match|total|over|under|spread|handicap|correct score|set betting|set winner|set \d+|set\s*\d+\s*winner|first set|second set|total sets?|game betting|quarter|period|half|first five|first 5|5 innings?|inning|tied?|draw|method|round|map|race to|player props?|team total|points|goals)\b/i;
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

function parseTradeProbability(value) {
  const price = Number.parseFloat(value);
  return Number.isFinite(price) && price > 0 && price < 1 ? price : null;
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

function roundPrice(value) {
  return Math.round(Number(value) * 10000) / 10000;
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
  const marketText = [polyMarket.text, ...(polyMarket.outcomes || [])].filter(Boolean).join(" ");
  const aliasScores = aliasesForEntityFromTeams(entity, polyMarket.teams || []).map((alias) => entityMatchScore(marketText, alias));
  const scores = [entityMatchScore(polyMarket.text, entity), ...(polyMarket.outcomes || []).map((outcome) => entityMatchScore(outcome, entity)), ...aliasScores];
  return scores.sort((a, b) => b.score - a.score)[0] || { matched: false, score: 0, reason: "not checked" };
}

function entityMentioned(text = "", entity = "") {
  return entityMatchScore(text, entity).matched;
}

function teamAliases(team = {}) {
  return [team.name, team.alias, team.abbreviation]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function teamMatchesEntity(team = {}, entity = "") {
  return teamAliases(team).some((alias) => entityMatchScore(entity, alias).matched || entityMatchScore(alias, entity).matched);
}

function aliasesForEntityFromTeams(entity = "", teams = []) {
  const aliases = [];
  for (const team of teams || []) {
    if (!teamMatchesEntity(team, entity)) continue;
    aliases.push(...teamAliases(team));
  }
  return [...new Set(aliases)];
}

function entityMentionedForMarket(polyMarket = {}, text = "", entity = "") {
  if (entityMentioned(text, entity)) return true;
  return aliasesForEntityFromTeams(entity, polyMarket.teams || []).some((alias) => entityMentioned(text, alias));
}

function entityFirstIndexForMarket(polyMarket = {}, text = "", entity = "") {
  const indexes = [entityFirstIndex(text, entity), ...aliasesForEntityFromTeams(entity, polyMarket.teams || []).map((alias) => entityFirstIndex(text, alias))]
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
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
  const eventPrefix = String(market.title || market.question || "").split(":")[0]?.trim();
  if (eventPrefix && eventPrefix.length >= 3 && eventPrefix.length <= 40 && !CROSS_SPORT_BLOCKED_RE.test(eventPrefix)) hints.add(eventPrefix);
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

  if (hasNormalizedPhrase(text, "atp") || hasNormalizedPhrase(text, "challenger") || hasNormalizedPhrase(text, "men singles")) slugs.add("atp");
  if (hasNormalizedPhrase(text, "wta") || hasNormalizedPhrase(text, "women singles")) slugs.add("wta");
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
  if (hasNormalizedPhrase(text, "tennis") && !slugs.has("atp") && !slugs.has("wta")) {
    slugs.add("atp");
    slugs.add("wta");
  }

  return [...slugs];
}

function rawPolymarketEventMatchesCloudbet(event = {}, cloudbetEvent = {}) {
  const text = [event.title, event.name, event.slug, event.ticker].filter(Boolean).join(" ");
  const homeScore = entityMatchScore(text, cloudbetEvent.home);
  const awayScore = entityMatchScore(text, cloudbetEvent.away);
  return homeScore.matched && awayScore.matched;
}

function rawPolymarketEventDateGapHours(event = {}, cloudbetEvent = {}) {
  const raw = event.startTime || event.eventDate || event.startDate || event.startDateIso || event.endDate || event.endDateIso;
  if (!raw || !cloudbetEvent.startIso) return null;
  const left = new Date(raw).getTime();
  const right = new Date(cloudbetEvent.startIso).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.round((Math.abs(left - right) / (1000 * 60 * 60)) * 10) / 10;
}

function rawPolymarketEventDateClose(event = {}, cloudbetEvent = {}) {
  const gapHours = rawPolymarketEventDateGapHours(event, cloudbetEvent);
  return gapHours === null || gapHours <= SAME_EVENT_MAX_HOURS;
}

function minCloudbetStartIso(events = []) {
  const times = events
    .map((event) => (event.startIso ? new Date(event.startIso).getTime() : NaN))
    .filter(Number.isFinite);
  if (!times.length) return isoDate(0) + "T00:00:00Z";
  const min = Math.min(...times) - (1000 * 60 * 60 * 12);
  return new Date(min).toISOString();
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

function normalizePolymarketTeam(team = {}) {
  return {
    id: String(team.id || team.providerId || team.name || ""),
    name: String(team.name || "").trim(),
    league: String(team.league || "").trim().toLowerCase(),
    alias: String(team.alias || "").trim(),
    abbreviation: String(team.abbreviation || "").trim(),
    providerId: team.providerId || null,
  };
}

async function getPolymarketSportsMetadata(env, diagnostics = {}) {
  const payload = await fetchPolymarket(env, "/sports?limit=500");
  const sports = polymarketList(payload)
    .map((sport) => ({
      id: String(sport.id || sport.series || sport.sport || ""),
      sport: String(sport.sport || "").trim().toLowerCase(),
      series: String(sport.series || "").trim(),
      ordering: String(sport.ordering || "").trim(),
      tags: String(sport.tags || "").trim(),
    }))
    .filter((sport) => sport.sport);
  diagnostics.sportsMetadataCount = sports.length;
  return sports;
}

async function getPolymarketTeamsForLeagues(env, leagues = [], diagnostics = {}, options = {}) {
  const teamsByLeague = new Map();
  const uniqueLeagues = [...new Set(leagues.map((league) => String(league || "").trim().toLowerCase()).filter(Boolean))];
  diagnostics.teamLeaguesTried = uniqueLeagues;
  diagnostics.teamsFetched = 0;

  for (const league of uniqueLeagues.slice(0, options.polymarketSeriesLimit || 10)) {
    try {
      const payload = await fetchPolymarket(env, `/teams?league=${encodeURIComponent(league)}&limit=100`);
      const teams = polymarketList(payload).map(normalizePolymarketTeam).filter((team) => team.name);
      teamsByLeague.set(league, teams);
      diagnostics.teamsFetched += teams.length;
    } catch (error) {
      diagnostics.errors.push(`teams ${league}: ${error.message}`);
      teamsByLeague.set(league, []);
    }
  }

  return teamsByLeague;
}

function polymarketMarketUrl(market = {}, event = {}) {
  const eventSlug = event.slug || market.eventSlug || market.event_slug;
  const marketSlug = market.slug || market.market_slug;
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  if (marketSlug) return `https://polymarket.com/market/${marketSlug}`;
  return "https://polymarket.com";
}

function rawPolymarketYesNoMoneyline(rawMarket = {}, event = {}) {
  const outcomes = safeJsonArray(rawMarket.outcomes);
  const first = normalizeName(outcomes[0] || "");
  const second = normalizeName(outcomes[1] || "");
  if (first !== "yes" || second !== "no") return false;
  const text = [rawMarket.question, rawMarket.title, rawMarket.slug, event.title, event.name].filter(Boolean).join(" ");
  if (/\b(completed match|over|under|total|spread|handicap|props?)\b/i.test(text)) return false;
  return /\b(winning|winner|moneyline|match result|draw|tie|tied)\b/i.test(text);
}

function polymarketFeeRate(rawMarket = {}) {
  const scheduleRate = Number(rawMarket.feeSchedule?.rate);
  if (Number.isFinite(scheduleRate) && scheduleRate >= 0 && scheduleRate < 0.2) return scheduleRate;
  return 0;
}

function applyPolymarketBuyFee(price, rawMarket = {}) {
  const parsed = parseTradeProbability(price);
  if (!parsed) return null;
  const withFee = parsed * (1 + polymarketFeeRate(rawMarket));
  return roundPrice(Math.min(0.99, withFee));
}

function polymarketBuyPrices(rawMarket = {}, referencePrices = []) {
  const bestAsk = parseTradeProbability(rawMarket.bestAsk);
  const bestBid = parseTradeProbability(rawMarket.bestBid);
  const firstBuy = applyPolymarketBuyFee(bestAsk || referencePrices[0], rawMarket);
  const secondAsk = bestBid ? 1 - bestBid : referencePrices[1];
  const secondBuy = applyPolymarketBuyFee(secondAsk, rawMarket);
  return [firstBuy || referencePrices[0] || null, secondBuy || referencePrices[1] || null];
}

function normalizePolymarketMarket(rawMarket = {}, event = {}) {
  if (!rawMarket || rawMarket.closed || rawMarket.archived || rawMarket.active === false || rawMarket.acceptingOrders === false || rawMarket.enableOrderBook === false) return null;
  const outcomes = safeJsonArray(rawMarket.outcomes);
  const prices = safeJsonArray(rawMarket.outcomePrices || rawMarket.outcome_prices);
  if (outcomes.length !== 2 || prices.length !== 2) return null;
  const firstPrice = parseProbability(prices[0]);
  const secondPrice = parseProbability(prices[1]);
  if (!firstPrice || !secondPrice) return null;
  const question = rawMarket.question || rawMarket.title || event.title || event.name || "";
  const title = event.title || event.name || question;
  const text = [question, title, event.slug, rawMarket.slug].filter(Boolean).join(" ");
  if (CROSS_SPORT_BLOCKED_RE.test(text)) return null;
  if (BAD_BINARY_MARKET_RE.test(text) && !rawPolymarketYesNoMoneyline(rawMarket, event)) return null;
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
    buyPrices: polymarketBuyPrices(rawMarket, [firstPrice, secondPrice]),
    feeRate: polymarketFeeRate(rawMarket),
    bestBid: parseTradeProbability(rawMarket.bestBid),
    bestAsk: parseTradeProbability(rawMarket.bestAsk),
    priceSource: rawMarket.bestAsk || rawMarket.bestBid ? "bestAsk+fee" : "outcomePrices",
    volume: Number(rawMarket.volume || rawMarket.volumeNum || event.volume || 0) || 0,
    teams: Array.isArray(event.teams) ? event.teams : [],
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
    strategy: "events-pagination",
    endpointsTried: [],
    seriesScanned: 0,
    eventsDiscovered: 0,
    eventsHydrated: 0,
    marketsScanned: 0,
    binaryMarkets: 0,
    sportSeries: [],
    errors: [],
  };
  const seriesSlugs = Array.isArray(options.polymarketSeries) && options.polymarketSeries.length
    ? options.polymarketSeries
    : String(env.POLYMARKET_SPORT_SERIES || "")
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean);
  const slugs = (seriesSlugs.length ? seriesSlugs : POLYMARKET_SPORT_SERIES).slice(0, options.polymarketSeriesLimit);
  const normalized = [];
  const seen = new Set();
  const sports = new Set();
  const marketSports = new Set();
  const competitionHints = new Set();
  const startDateMin = `${isoDate(-1)}T00:00:00Z`;
  diagnostics.startDateMin = startDateMin;

  for (const slug of slugs) {
    if (diagnostics.eventsHydrated >= options.polymarketEventLimit || normalized.length >= options.polymarketLimit) break;
    const endpoint = `/events?series_slug=${encodeURIComponent(slug)}&active=true&start_date_min=${encodeURIComponent(startDateMin)}&limit=${encodeURIComponent(options.polymarketRawEventsPerSeries || 20)}`;
    diagnostics.endpointsTried.push(endpoint);
    try {
      const payload = await fetchPolymarket(env, endpoint);
      diagnostics.seriesScanned += 1;
      const seriesSlug = slug;
      const events = polymarketList(payload)
        .filter(isOpenPolymarketSportsEvent)
        .slice(0, options.polymarketEventsPerSeries);
      diagnostics.eventsDiscovered += events.length;
      if (events.length) {
        diagnostics.sportSeries.push({ slug: seriesSlug, title: seriesSlug, events: events.length });
        sports.add(seriesSlug);
      }
      for (const event of events) {
        if (diagnostics.eventsHydrated >= options.polymarketEventLimit || normalized.length >= options.polymarketLimit) break;
        diagnostics.eventsHydrated += 1;
        const pairs = Array.isArray(event.markets) && event.markets.length
          ? event.markets.map((market) => ({ market, event }))
          : await hydratePolymarketEventMarkets(env, { ...event, seriesSlug }, diagnostics);
        for (const { market, event: marketEvent } of pairs) {
          diagnostics.marketsScanned += 1;
          const candidate = normalizePolymarketMarket(market, { ...event, ...marketEvent, seriesSlug });
          if (!candidate || seen.has(candidate.id)) continue;
          seen.add(candidate.id);
          normalized.push(candidate);
          marketSports.add(candidate.seriesSlug);
          polymarketCompetitionHints(candidate).forEach((hint) => competitionHints.add(hint));
          if (normalized.length >= options.polymarketLimit) break;
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

  const inferredSlugs = [...seriesToCloudbetEvents.keys()].slice(0, options.polymarketSeriesLimit);
  let slugs = inferredSlugs;
  try {
    const sportsMetadata = await getPolymarketSportsMetadata(env, diagnostics);
    const availableSports = new Set(sportsMetadata.map((sport) => sport.sport));
    slugs = inferredSlugs.filter((slug) => availableSports.has(slug));
    diagnostics.sportsMatched = sportsMetadata.filter((sport) => slugs.includes(sport.sport)).map((sport) => ({
      sport: sport.sport,
      series: sport.series,
      ordering: sport.ordering,
    }));
  } catch (error) {
    diagnostics.errors.push(`sports metadata: ${error.message}`);
  }
  diagnostics.seriesInferred = slugs.map((slug) => ({ slug, cloudbetEvents: seriesToCloudbetEvents.get(slug)?.length || 0 }));
  const teamsByLeague = options.includeCoverage ? await getPolymarketTeamsForLeagues(env, slugs, diagnostics, options) : new Map();

  const normalized = [];
  const seen = new Set();
  const startDateMin = minCloudbetStartIso(cloudbetEvents);
  diagnostics.startDateMin = startDateMin;
  for (const slug of slugs) {
    if (diagnostics.eventsHydrated >= options.polymarketEventLimit) break;
    const cloudbetForSeries = seriesToCloudbetEvents.get(slug) || [];
    const endpoint = `/events?series_slug=${encodeURIComponent(slug)}&active=true&start_date_min=${encodeURIComponent(startDateMin)}&limit=${encodeURIComponent(options.polymarketRawEventsPerSeries || 20)}`;
    diagnostics.endpointsTried.push(endpoint);
    try {
      const payload = await fetchPolymarket(env, endpoint);
      diagnostics.seriesScanned += 1;
      const seriesSlug = slug;
      const teams = teamsByLeague.get(seriesSlug) || [];
      const events = polymarketList(payload).filter(isOpenPolymarketSportsEvent);
      const relevantEvents = events
        .filter((event) => cloudbetForSeries.some((cloudbetEvent) => rawPolymarketEventDateClose(event, cloudbetEvent) && rawPolymarketEventMatchesCloudbet(event, cloudbetEvent)))
        .slice(0, options.polymarketEventsPerSeries);
      diagnostics.eventsDiscovered += events.length;
      diagnostics.eventsRelevant += relevantEvents.length;
      diagnostics.sportSeries.push({
        slug: seriesSlug,
        title: seriesSlug,
        events: events.length,
        relevantEvents: relevantEvents.length,
        teams: teams.length,
      });

      for (const event of relevantEvents) {
        if (diagnostics.eventsHydrated >= options.polymarketEventLimit) break;
        diagnostics.eventsHydrated += 1;
        const pairs = Array.isArray(event.markets) && event.markets.length
          ? event.markets.map((market) => ({ market, event }))
          : await hydratePolymarketEventMarkets(env, { ...event, seriesSlug, teams }, diagnostics);
        for (const { market, event: marketEvent } of pairs) {
          diagnostics.marketsScanned += 1;
          const candidate = normalizePolymarketMarket(market, { ...event, ...marketEvent, seriesSlug, teams });
          if (!candidate || seen.has(candidate.id)) continue;
          const matchesCloudbetEvent = cloudbetForSeries.some((cloudbetEvent) => polymarketCloudbetAnalysis(candidate, cloudbetEvent).teamsMatched);
          if (!matchesCloudbetEvent) continue;
          seen.add(candidate.id);
          normalized.push(candidate);
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
  const [firstPrice, secondPrice] = Array.isArray(polyMarket.buyPrices) && polyMarket.buyPrices.length === 2 ? polyMarket.buyPrices : polyMarket.prices;
  const [firstReferencePrice, secondReferencePrice] = polyMarket.prices || [];
  const firstText = firstOutcome || "";
  const secondText = secondOutcome || "";

  const orderedSides = (homeIndex, awayIndex, matchType) => {
    const buyPrices = [firstPrice, secondPrice];
    const referencePrices = [firstReferencePrice, secondReferencePrice];
    return {
      homePrice: buyPrices[homeIndex],
      awayPrice: buyPrices[awayIndex],
      homeReferencePrice: referencePrices[homeIndex],
      awayReferencePrice: referencePrices[awayIndex],
      priceSource: polyMarket.priceSource,
      feeRate: polyMarket.feeRate,
      matchType,
    };
  };

  if (entityMentionedForMarket(polyMarket, firstText, cloudbetEvent.home) && entityMentionedForMarket(polyMarket, secondText, cloudbetEvent.away)) {
    return orderedSides(0, 1, "outcome names");
  }
  if (entityMentionedForMarket(polyMarket, firstText, cloudbetEvent.away) && entityMentionedForMarket(polyMarket, secondText, cloudbetEvent.home)) {
    return orderedSides(1, 0, "outcome names reversed");
  }

  const yesNo = normalizeName(firstOutcome) === "yes" && normalizeName(secondOutcome) === "no";
  if (!yesNo) return null;
  const homeMentioned = entityMentionedForMarket(polyMarket, polyMarket.text, cloudbetEvent.home);
  const awayMentioned = entityMentionedForMarket(polyMarket, polyMarket.text, cloudbetEvent.away);
  if (!homeMentioned || !awayMentioned) return null;

  const normalizedText = normalizeName(polyMarket.text);
  const homeIndex = entityFirstIndexForMarket(polyMarket, normalizedText, cloudbetEvent.home);
  const awayIndex = entityFirstIndexForMarket(polyMarket, normalizedText, cloudbetEvent.away);
  if (homeIndex < 0 || awayIndex < 0) return null;

  if (homeIndex < awayIndex) return orderedSides(0, 1, "yes/no first-mentioned home");
  return orderedSides(1, 0, "yes/no first-mentioned away");
}

function polymarketCloudbetMatch(polyMarket = {}, cloudbetEvent = {}) {
  const analysis = polymarketCloudbetAnalysis(polyMarket, cloudbetEvent);
  if (!analysis.teamsMatched || !analysis.dateClose) return null;
  const sides = inferPolymarketSides(polyMarket, cloudbetEvent);
  if (!sides) return null;
  return { ...sides, dateGapHours: analysis.dateGapHours, homeScore: analysis.homeScore.score, awayScore: analysis.awayScore.score };
}

function candidateTokensForEntity(entity = "") {
  const important = importantTokens(entity).filter((token) => token.length >= 3);
  const fallback = normalizedTokens(entity).filter((token) => token.length >= 2 && !GENERIC_ENTITY_TOKENS.has(token));
  return [...new Set(important.length ? important : fallback)];
}

function polymarketSearchText(polyMarket = {}) {
  const teamText = (polyMarket.teams || []).flatMap(teamAliases).join(" ");
  return [polyMarket.text, polyMarket.question, polyMarket.title, ...(polyMarket.outcomes || []), teamText].filter(Boolean).join(" ");
}

function buildPolymarketCandidateIndex(markets = []) {
  const tokenToMarkets = new Map();
  for (const market of markets) {
    for (const token of new Set(normalizedTokens(polymarketSearchText(market)).filter((part) => part.length >= 2))) {
      if (!tokenToMarkets.has(token)) tokenToMarkets.set(token, new Set());
      tokenToMarkets.get(token).add(market);
    }
  }
  return tokenToMarkets;
}

function unionCandidatesForTokens(index, tokens = []) {
  const candidates = new Set();
  for (const token of tokens) {
    const matches = index.get(token);
    if (!matches) continue;
    for (const market of matches) candidates.add(market);
  }
  return candidates;
}

function intersectCandidateSets(left, right) {
  const result = new Set();
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const item of small) {
    if (large.has(item)) result.add(item);
  }
  return result;
}

function candidatePolymarketMarkets(index, cloudbetEvent = {}) {
  const homeTokens = candidateTokensForEntity(cloudbetEvent.home);
  const awayTokens = candidateTokensForEntity(cloudbetEvent.away);
  if (!homeTokens.length || !awayTokens.length) return [];
  const homeCandidates = unionCandidatesForTokens(index, homeTokens);
  const awayCandidates = unionCandidatesForTokens(index, awayTokens);
  if (!homeCandidates.size || !awayCandidates.size) return [];
  return [...intersectCandidateSets(homeCandidates, awayCandidates)];
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

function decimalCoefficient(probability) {
  if (!probability || probability <= 0 || probability >= 1) return null;
  return Math.round((1 / probability) * 100) / 100;
}

function probabilityPercent(probability) {
  return Math.round(probability * 10000) / 100;
}

function marketOverroundPercent(prices = []) {
  const total = prices.reduce((sum, price) => sum + Number(price || 0), 0);
  return Math.round((total - 1) * 10000) / 100;
}

function bettingOutcome(probability, label, referenceProbability = null, priceSource = "outcomePrices") {
  const coefficient = decimalCoefficient(probability);
  if (!coefficient) return null;
  return {
    label,
    probability,
    probabilityPercent: probabilityPercent(probability),
    decimalCoefficient: coefficient,
    referenceProbability,
    referenceDecimalCoefficient: decimalCoefficient(referenceProbability),
    priceSource,
  };
}

function splitEventSides(title = "") {
  const cleanTitle = String(title || "").split(/\s+-\s+/)[0].trim();
  const parts = cleanTitle.split(/\s+v(?:s\.?|ersus)\s+/i).map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts.slice(1).join(" vs ")] : ["", ""];
}

function isYesNoMarket(market = {}) {
  return normalizeName(market.outcomes?.[0] || "") === "yes" && normalizeName(market.outcomes?.[1] || "") === "no";
}

function isDirectMoneylineMarket(market = {}) {
  if (!market || market.outcomes?.length !== 2 || market.prices?.length !== 2 || isYesNoMarket(market)) return false;
  const first = normalizeName(market.outcomes[0]);
  const second = normalizeName(market.outcomes[1]);
  if (!first || !second || first === second) return false;
  if (["over", "under"].includes(first) || ["over", "under"].includes(second)) return false;
  const marketSlug = String(market.slug || "").toLowerCase();
  const eventSlug = String(market.eventSlug || "").toLowerCase();
  if (marketSlug && eventSlug && marketSlug === eventSlug) return true;
  return normalizeName(market.question) === normalizeName(market.title);
}

function moneylineCodeForYesMarket(market = {}) {
  const text = [market.question, market.slug].filter(Boolean).join(" ");
  const normalizedText = normalizeName(text);
  if (/\b(draw|tie|tied)\b/i.test(text) || includesNormalizedPhrase(normalizedText, "draw") || includesNormalizedPhrase(normalizedText, "tie") || includesNormalizedPhrase(normalizedText, "tied")) return "X";

  const [firstSide, secondSide] = splitEventSides(market.title || market.question);
  const firstScore = entityMatchScore(text, firstSide);
  const secondScore = entityMatchScore(text, secondSide);
  if (firstScore.matched && !secondScore.matched) return "1";
  if (secondScore.matched && !firstScore.matched) return "2";

  const slug = String(market.slug || "").toLowerCase();
  if (slug.endsWith("-draw")) return "X";
  if (slug.endsWith("-away")) return "1";
  if (slug.endsWith("-home")) return "2";
  return null;
}

function bestMoneylineMarkets(markets = []) {
  const byEvent = new Map();
  for (const market of markets) {
    const eventKey = market.eventSlug || market.title || market.id;
    if (!byEvent.has(eventKey)) byEvent.set(eventKey, []);
    byEvent.get(eventKey).push(market);
  }

  const rows = [];
  for (const [eventKey, eventMarkets] of byEvent) {
    const direct = eventMarkets.find(isDirectMoneylineMarket);
    if (direct) {
      const outcome1 = bettingOutcome(direct.buyPrices?.[0] || direct.prices[0], direct.outcomes[0], direct.prices[0], direct.priceSource);
      const outcome2 = bettingOutcome(direct.buyPrices?.[1] || direct.prices[1], direct.outcomes[1], direct.prices[1], direct.priceSource);
      if (outcome1 && outcome2) {
        const displayPrices = [outcome1.probability, outcome2.probability];
        rows.push({
          id: `moneyline-${direct.id}`,
          marketId: direct.id,
          seriesSlug: direct.seriesSlug,
          event: direct.title || direct.question,
          market: direct.question,
          marketType: "moneyline",
          outcome1,
          outcomeX: null,
          outcome2,
          probabilityTotal: Math.round(displayPrices.reduce((sum, price) => sum + price, 0) * 10000) / 10000,
          overroundPercent: marketOverroundPercent(displayPrices),
          priceSource: direct.priceSource,
          feeRate: direct.feeRate,
          referenceProbabilityTotal: Math.round((direct.prices[0] + direct.prices[1]) * 10000) / 10000,
          startIso: direct.startIso,
          endDate: direct.endDate,
          volume: direct.volume,
          url: direct.url,
        });
      }
      continue;
    }

    const grouped = { "1": null, X: null, "2": null };
    let source = null;
    for (const market of eventMarkets) {
      if (!isYesNoMarket(market)) continue;
      const code = moneylineCodeForYesMarket(market);
      if (!code || grouped[code]) continue;
      const yesOutcome = bettingOutcome(market.buyPrices?.[0] || market.prices[0], code === "X" ? "Draw" : market.question.replace(/\?$/, ""), market.prices[0], market.priceSource);
      if (!yesOutcome) continue;
      grouped[code] = yesOutcome;
      source ||= market;
    }

    if (source && (grouped["1"] || grouped["2"] || grouped.X)) {
      const prices = [grouped["1"]?.probability, grouped.X?.probability, grouped["2"]?.probability].filter((value) => value !== undefined && value !== null);
      const referencePrices = [grouped["1"]?.referenceProbability, grouped.X?.referenceProbability, grouped["2"]?.referenceProbability].filter((value) => value !== undefined && value !== null);
      rows.push({
        id: `moneyline-${eventKey}`,
        marketId: source.marketId || source.id,
        seriesSlug: source.seriesSlug,
        event: source.title || source.question,
        market: source.title || source.question,
        marketType: "moneyline-1x2",
        outcome1: grouped["1"],
        outcomeX: grouped.X,
        outcome2: grouped["2"],
        probabilityTotal: Math.round(prices.reduce((sum, price) => sum + Number(price || 0), 0) * 10000) / 10000,
        overroundPercent: marketOverroundPercent(prices),
        priceSource: source.priceSource,
        feeRate: source.feeRate,
        referenceProbabilityTotal: Math.round(referencePrices.reduce((sum, price) => sum + Number(price || 0), 0) * 10000) / 10000,
        startIso: source.startIso,
        endDate: source.endDate,
        volume: Math.max(...eventMarkets.map((market) => Number(market.volume || 0))),
        url: source.url,
      });
    }
  }
  return rows;
}

async function scanPolymarketOdds(env, options = {}) {
  const polymarket = await getPolymarketBinaryMarkets(env, options);
  const rows = bestMoneylineMarkets(polymarket.markets);

  rows.sort((a, b) => {
    const aDate = new Date(a.startIso || a.endDate || "9999-12-31").getTime();
    const bDate = new Date(b.startIso || b.endDate || "9999-12-31").getTime();
    return aDate - bDate || (b.volume || 0) - (a.volume || 0) || a.event.localeCompare(b.event);
  });

  return {
    rows: rows.slice(0, options.rowLimit),
    marketsNormalized: rows.length,
    series: [...new Set(rows.map((row) => row.seriesSlug).filter(Boolean))],
    diagnostics: polymarket.diagnostics,
  };
}

function buildCrossVenueCandidate(cloudbetEvent, polyMarket, sides, cloudbetSide, bankroll, polyBuffer, cloudbetAffiliateUrl) {
  const opposite = cloudbetSide === "home" ? "away" : "home";
  const cloudbetPrice = cloudbetEvent.odds[cloudbetSide];
  const polyBuyPrice = sides[`${opposite}Price`];
  const polyReferencePrice = sides[`${opposite}ReferencePrice`];
  if (!cloudbetPrice || !polyBuyPrice) return null;
  const polyPrice = Math.min(0.99, Math.round((polyBuyPrice + polyBuffer) * 10000) / 10000);
  const impliedTotal = (1 / cloudbetPrice) + polyPrice;
  const edgePercent = (1 - impliedTotal) * 100;
  const cloudbetStake = bankroll / (1 + cloudbetPrice * polyPrice);
  const polymarketShares = cloudbetStake * cloudbetPrice;
  const polymarketCost = polymarketShares * polyPrice;
  const expectedProfit = polymarketShares - bankroll;

  return {
    eventKey: `cross-${cloudbetEvent.id}-${polyMarket.id}-${cloudbetSide}`,
    hedgeStrategy: "buy-opposite",
    polymarketAction: "Buy",
    sport: cloudbetEvent.sport,
    competition: cloudbetEvent.competition,
    match: `${cloudbetEvent.home} vs ${cloudbetEvent.away}`,
    startIso: cloudbetEvent.startIso,
    cloudbetSide,
    cloudbetPick: cloudbetSide === "home" ? cloudbetEvent.home : cloudbetEvent.away,
    polymarketPick: opposite === "home" ? cloudbetEvent.home : cloudbetEvent.away,
    cloudbetOdds: cloudbetPrice,
    polymarketPrice: polyPrice,
    polymarketBuyPrice: polyBuyPrice,
    polymarketReferencePrice: polyReferencePrice,
    polymarketRawPrice: polyBuyPrice,
    polymarketPriceSource: sides.priceSource || polyMarket.priceSource || "buy-price",
    polymarketFeeRate: sides.feeRate ?? polyMarket.feeRate ?? null,
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
  let cloudbet;
  let polymarket;
  if (options.crossVenueStrategy === "cloudbet-first") {
    cloudbet = await getCloudbetAllSportEvents(env, options)
      .catch((error) => ({ events: [], diagnostics: { error: error.message, hasCloudbetApiKey: Boolean(env.CLOUDBET_API_KEY) } }));
    polymarket = await getPolymarketBinaryMarketsForCloudbetEvents(env, cloudbet.events, options)
      .catch((error) => ({ markets: [], cloudbetSports: [], diagnostics: { error: error.message, hasPolymarketApiKey: Boolean(env.POLYMARKET_API_KEY), strategy: "cloudbet-first" } }));
  } else {
    polymarket = await getPolymarketBinaryMarkets(env, options)
      .catch((error) => ({ markets: [], cloudbetSports: [], competitionHints: [], diagnostics: { error: error.message, hasPolymarketApiKey: Boolean(env.POLYMARKET_API_KEY), strategy: "polymarket-first" } }));
    cloudbet = await getCloudbetAllSportEvents(env, {
      ...options,
      preferredCloudbetSports: polymarket.cloudbetSports,
      competitionHints: polymarket.competitionHints,
    }).catch((error) => ({ events: [], diagnostics: { error: error.message, hasCloudbetApiKey: Boolean(env.CLOUDBET_API_KEY) } }));
    polymarket.diagnostics.strategy = "polymarket-first";
  }
  const cloudbetAffiliateUrl = (env.CLOUDBET_AFFILIATE_URL || DEFAULT_CLOUDBET_AFFILIATE_URL).trim();
  const checked = [];
  const opportunities = [];
  let matchedMarkets = 0;
  let candidateComparisons = 0;
  const collectCoverage = Boolean(options.includeCoverage);
  const polymarketCoverage = collectCoverage ? buildPolymarketCoverage(polymarket.markets.slice(0, 30), cloudbet.events.slice(0, 30)) : [];
  const polymarketCandidateIndex = buildPolymarketCandidateIndex(polymarket.markets);

  for (const cloudbetEvent of cloudbet.events) {
    const eventMatches = [];
    const nearMatches = [];
    const candidateMarkets = candidatePolymarketMarkets(polymarketCandidateIndex, cloudbetEvent);
    candidateComparisons += candidateMarkets.length;
    for (const polyMarket of candidateMarkets) {
      const sides = polymarketCloudbetMatch(polyMarket, cloudbetEvent);
      if (!sides) {
        if (collectCoverage && nearMatches.length < 3) {
          const analysis = polymarketCloudbetAnalysis(polyMarket, cloudbetEvent);
          if (analysis.teamsMatched || (analysis.dateClose && analysis.combinedScore >= 1.2)) {
            nearMatches.push({ question: polyMarket.question, reason: nearMatchReason(analysis), dateGapHours: analysis.dateGapHours });
          }
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
      candidateMarkets: candidateMarkets.length,
      polymarketMatches: eventMatches.slice(0, 3),
      polymarketNearMatches: collectCoverage ? nearMatches.slice(0, 3) : [],
    });
  }

  return {
    cloudbetEventsScanned: cloudbet.events.length,
    polymarketMarketsScanned: polymarket.markets.length,
    matchedMarkets,
    candidateComparisons,
    opportunities,
    checked,
    polymarketCoverage,
    cloudbetDiagnostics: cloudbet.diagnostics,
    polymarketDiagnostics: polymarket.diagnostics,
    competitionHints: polymarket.competitionHints || [],
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
  const requestedMode = url.searchParams.get("mode");
  const mode = ["cross-sport", "polymarket-odds"].includes(requestedMode) ? requestedMode : "tennis";
  const requestedSeries = String(url.searchParams.get("series") || "")
    .split(",")
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean);
  const requestedStrategy = url.searchParams.get("strategy") === "cloudbet-first" ? "cloudbet-first" : "polymarket-first";
  const options = {
    dateStart: url.searchParams.get("date_start") || isoDate(0),
    dateStop: url.searchParams.get("date_stop") || isoDate(7),
    scanLimit: clampInteger(url.searchParams.get("scan") || "40", 40, 1, mode === "cross-sport" ? 250 : 80),
    bankroll: clampNumber(url.searchParams.get("bankroll") || "100", 100, 1, 100000),
    sportLimit: clampInteger(url.searchParams.get("sports") || env.CLOUDBET_ARB_SPORT_LIMIT || "4", 4, 1, 8),
    competitionLimitPerSport: clampInteger(url.searchParams.get("competitions") || env.CLOUDBET_ARB_COMPETITION_LIMIT || "16", 16, 1, 40),
    cloudbetCompetitionFetchLimit: clampInteger(url.searchParams.get("cloudbet_competitions_total") || env.CLOUDBET_ARB_COMPETITION_FETCH_LIMIT || "8", 8, 1, 12),
    cloudbetCompetitionsPerSportLimit: clampInteger(url.searchParams.get("cloudbet_competitions_per_sport") || env.CLOUDBET_ARB_COMPETITIONS_PER_SPORT || "2", 2, 1, 4),
    eventLimit: clampInteger(url.searchParams.get("events") || url.searchParams.get("scan") || "80", 80, 1, 250),
    polymarketLimit: clampInteger(url.searchParams.get("polymarket") || env.POLYMARKET_ARB_MARKET_LIMIT || "500", 500, 25, 1000),
    polymarketSeriesLimit: clampInteger(url.searchParams.get("poly_series") || env.POLYMARKET_ARB_SERIES_LIMIT || "6", 6, 1, 10),
    polymarketRawEventsPerSeries: clampInteger(url.searchParams.get("poly_raw_events_per_series") || env.POLYMARKET_ARB_RAW_EVENTS_PER_SERIES || "8", 8, 5, 20),
    polymarketEventsPerSeries: clampInteger(url.searchParams.get("poly_events_per_series") || env.POLYMARKET_ARB_EVENTS_PER_SERIES || "5", 5, 1, 10),
    polymarketEventLimit: clampInteger(url.searchParams.get("poly_events") || env.POLYMARKET_ARB_EVENT_LIMIT || "12", 12, 1, 30),
    polymarketSeries: requestedSeries,
    rowLimit: clampInteger(url.searchParams.get("limit") || "160", 160, 10, 500),
    polyBuffer: clampNumber(url.searchParams.get("poly_buffer") || env.POLYMARKET_PRICE_BUFFER || "0", 0, 0, 0.1),
    includeCoverage: url.searchParams.get("coverage") === "1",
    crossVenueStrategy: requestedStrategy,
  };

  if (mode === "polymarket-odds") {
    const normalized = await scanPolymarketOdds(env, options);
    const coefficients = normalized.rows.flatMap((row) => [row.outcome1, row.outcomeX, row.outcome2]
      .map((outcome) => outcome?.decimalCoefficient)
      .filter((coefficient) => Number.isFinite(coefficient)));
    return jsonResponse({
      ok: true,
      mode,
      generatedAt: new Date().toISOString(),
      source: "Polymarket Gamma active moneyline markets normalized to 1/X/2 decimal odds",
      memberOnly: true,
      authType: auth.type,
      member: auth.member ? { email: auth.member.email, name: auth.member.name || "" } : null,
      options,
      summary: {
        coefficients: coefficients.length,
        marketsNormalized: normalized.marketsNormalized,
        series: normalized.series,
        bestCoefficient: coefficients.length ? Math.max(...coefficients) : null,
      },
      rows: normalized.rows,
      polymarketDiagnostics: normalized.diagnostics,
      note: "Polymarket prices are probabilities, not bookmaker odds. 1 is the first listed side, X is draw when present, and 2 is the second listed side. Decimal odds are calculated as 1 / Polymarket price before fees, spreads, slippage and settlement-rule differences.",
    });
  }

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
        candidateComparisons: cross.candidateComparisons,
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
