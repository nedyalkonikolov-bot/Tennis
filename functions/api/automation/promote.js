const SITE_URL = "https://www.tennistipz.win";
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters";
const X_TWEET_URL = "https://api.twitter.com/2/tweets";
const THREADS_API_URL = "https://graph.threads.net/v1.0";
const MIN_PUBLIC_PICK_ODDS = 1.4;
const NEWS_FEEDS = [
  { name: "ESPN", url: "https://www.espn.com/espn/rss/tennis/news" },
  { name: "TennisHead", url: "https://r.jina.ai/http://https://tennishead.net/feed", type: "jinaMarkdown" },
];
const THREADS_LOCALES = {
  en: {
    label: "English",
    pick: "Pick",
    odds: "Odds",
    preview: "Preview",
    offer: "Offer",
    news: "News angle",
    follow: "Follow TennisTipz.",
    engage: "Comment your pick and repost for more tennis predictions.",
    responsible: "18+ Bet responsibly.",
    hashtags: ["#TennisPredictions", "#TennisBetting"],
  },
  hi: {
    label: "Hindi",
    pick: "पिक",
    odds: "ऑड्स",
    preview: "प्रीव्यू",
    offer: "ऑफर",
    news: "न्यूज एंगल",
    follow: "TennisTipz को फॉलो करें.",
    engage: "अपना पिक कमेंट करें और ज्यादा टेनिस भविष्यवाणियों के लिए रीपोस्ट करें.",
    responsible: "18+ जिम्मेदारी से बेट करें.",
    hashtags: ["#टेनिसभविष्यवाणी", "#टेनिसबेटिंग"],
  },
  pt_br: {
    label: "Brazilian Portuguese",
    pick: "Palpite",
    odds: "Odds",
    preview: "Previa",
    offer: "Oferta",
    news: "Gancho da noticia",
    follow: "Siga o TennisTipz.",
    engage: "Comente seu palpite e reposte para mais previsoes de tenis.",
    responsible: "18+ Aposte com responsabilidade.",
    hashtags: ["#PalpitesDeTenis", "#ApostasTenis"],
  },
  es: {
    label: "Spanish",
    pick: "Pronostico",
    odds: "Cuota",
    preview: "Previa",
    offer: "Oferta",
    news: "Angulo de noticia",
    follow: "Sigue a TennisTipz.",
    engage: "Comenta tu pronostico y repostealo para mas picks de tenis.",
    responsible: "18+ Apuesta con responsabilidad.",
    hashtags: ["#PronosticosTenis", "#ApuestasTenis"],
  },
  tr: {
    label: "Turkish",
    pick: "Tahmin",
    odds: "Oran",
    preview: "Analiz",
    offer: "Teklif",
    news: "Haber acisi",
    follow: "TennisTipz'i takip edin.",
    engage: "Tahminini yorumlara yaz ve daha fazla tenis tahmini icin repost et.",
    responsible: "18+ Sorumlu bahis oynayın.",
    hashtags: ["#TenisTahminleri", "#TenisBahisleri"],
  },
};
function normalizeThreadsLanguage(value = "en") {
  const key = String(value || "en").toLowerCase().replace(/[-\s]/g, "_");
  if (["pt", "br", "ptbr", "pt_br", "brazilian"].includes(key)) return "pt_br";
  if (["hindi", "hin"].includes(key)) return "hi";
  if (["spanish", "spa"].includes(key)) return "es";
  if (["turkish", "tur"].includes(key)) return "tr";
  return THREADS_LOCALES[key] ? key : "en";
}
function threadsPlatformKey(language) {
  return language === "en" ? "threads" : `threads:${language}`;
}
const REFERRAL_LINKS = [
  {
    name: "Cloudbet",
    url: "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Predictions&aftm_cid=4",
  },
  { name: "BC.Game", url: "https://bc.game/i-9767ib363b-n/" },
  { name: "Stake", url: "https://stake.com/?c=NOYIoKcY" },
];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isAuthorized(request, env) {
  if (!env.DATABASE_SYNC_TOKEN) return false;
  const url = new URL(request.url);
  const token = request.headers.get("x-sync-token") || url.searchParams.get("token");
  return token && token === env.DATABASE_SYNC_TOKEN;
}

function hasOAuth1(env) {
  return Boolean(env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_TOKEN_SECRET);
}

function hasTwitterAuth(env) {
  return hasOAuth1(env) || Boolean(env.TWITTER_BEARER_TOKEN || env.X_BEARER_TOKEN || env.TWITTER_ACCESS_TOKEN || env.X_ACCESS_TOKEN);
}

function hasThreadsAuth(env) {
  return Boolean(env.THREADS_ACCESS_TOKEN);
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "match";
}

function oauthEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function base64Url(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function pemToArrayBuffer(pem) {
  const clean = String(pem || "")
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function signHmacSha1(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return arrayBufferToBase64(signature);
}

async function buildOAuth1Header(env, method, requestUrl) {
  const oauthParams = {
    oauth_consumer_key: env.X_API_KEY,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_token: env.X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  const url = new URL(requestUrl);
  const signatureParams = [...url.searchParams.entries(), ...Object.entries(oauthParams)]
    .map(([key, value]) => [oauthEncode(key), oauthEncode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
  const baseString = [method.toUpperCase(), oauthEncode(baseUrl), oauthEncode(signatureParams)].join("&");
  const signingKey = `${oauthEncode(env.X_API_SECRET)}&${oauthEncode(env.X_ACCESS_TOKEN_SECRET)}`;
  const oauthSignature = await signHmacSha1(signingKey, baseString);
  const headerParams = { ...oauthParams, oauth_signature: oauthSignature };

  return `OAuth ${Object.entries(headerParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${oauthEncode(key)}="${oauthEncode(value)}"`)
    .join(", ")}`;
}

async function signJwt(env) {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL || env.GSC_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: email,
    scope: GSC_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

async function getGoogleAccessToken(env) {
  const directToken = env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN || env.GSC_ACCESS_TOKEN;
  if (directToken) return { token: directToken, source: "access-token" };

  const assertion = await signJwt(env);
  if (!assertion) return null;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) return { error: true, status: response.status, payload };
  return { token: payload.access_token, source: "service-account" };
}

const HASHTAG_SETS = [
  ["#TennisBetting", "#TennisTips", "#CryptoBetting"],
  ["#TennisPredictions", "#ATP", "#WTA"],
  ["#TennisPicks", "#BettingTips", "#Tennis"],
  ["#LiveTennis", "#SportsBetting", "#TennisOdds"],
  ["#TennisPreview", "#CryptoSportsbook", "#TennisTipz"],
];

const FOLLOW_PROMPTS = [
  "Follow TennisTipz for more tennis picks.",
  "Follow us for daily tennis predictions.",
  "Follow TennisTipz for more ATP and WTA edges.",
  "Follow for fresh tennis betting previews.",
  "Follow the account for the next match card.",
];

function rotationIndex(match, modulo, salt = "") {
  const key = String(match.prediction_id || match.match_id || "match") + salt;
  const total = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return total % modulo;
}

function chooseReferralLink(match, preferredReferral) {
  const preferred = String(preferredReferral || "").toLowerCase();
  const forced = REFERRAL_LINKS.find((link) => link.name.toLowerCase().replace(/[^a-z0-9]/g, "") === preferred.replace(/[^a-z0-9]/g, ""));
  if (forced) return forced;
  return REFERRAL_LINKS[rotationIndex(match, REFERRAL_LINKS.length, "ref")];
}

function chooseHashtags(match) {
  return HASHTAG_SETS[rotationIndex(match, HASHTAG_SETS.length, "tags")].join(" ");
}

function chooseFollowPrompt(match) {
  return FOLLOW_PROMPTS[rotationIndex(match, FOLLOW_PROMPTS.length, "follow")];
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rssTag(item, tag) {
  return decodeHtml(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");
}

function parseJinaMarkdownHooks(text, feed, limit = 8) {
  return [...text.matchAll(/### \[([^\]]+)\]\((https?:\/\/[^\s)]+)\)[\s\S]*?\n([A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} [^\n]+)/g)]
    .slice(0, limit)
    .map((match, index) => {
      const title = decodeHtml(match[1]);
      const published = new Date(match[3]);
      return { id: match[2] || `${feed.name}-${index}`, title, summary: "", url: match[2], source: feed.name, publishedAt: Number.isNaN(published.getTime()) ? "" : published.toISOString() };
    });
}

async function getNewsHooksFromFeed(feed, limit = 8) {
  const response = await fetch(feed.url, { headers: { accept: feed.type === "jinaMarkdown" ? "text/plain, text/markdown" : "application/rss+xml, application/xml, text/xml" } });
  if (!response.ok) throw new Error(`${feed.name} news returned ${response.status}`);
  const text = await response.text();
  if (feed.type === "jinaMarkdown") return parseJinaMarkdownHooks(text, feed, limit);
  return text
    .split(/<item\b/i)
    .slice(1, limit + 1)
    .map((item, index) => {
      const title = rssTag(item, "title");
      const summary = rssTag(item, "description");
      const url = rssTag(item, "link") || rssTag(item, "guid") || "";
      const published = new Date(rssTag(item, "pubDate"));
      return title ? { id: url || `${feed.name}-${index}`, title, summary, url, source: feed.name, publishedAt: Number.isNaN(published.getTime()) ? "" : published.toISOString() } : null;
    })
    .filter(Boolean);
}

async function getRecentNewsHooks(limit = 8) {
  const settled = await Promise.allSettled(NEWS_FEEDS.map((feed) => getNewsHooksFromFeed(feed, limit)));
  const seen = new Set();
  return settled
    .flatMap((item) => item.status === "fulfilled" ? item.value : [])
    .filter((item) => item.url && !seen.has(item.url) && seen.add(item.url))
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, limit);
}

function chooseNewsHook(match, newsHooks = []) {
  if (!newsHooks.length) return null;
  return newsHooks[rotationIndex(match, newsHooks.length, "news")];
}

function normalizePostStyle(value) {
  const style = String(value || "").toLowerCase();
  if (["news", "headline", "hook"].includes(style)) return "news";
  if (["prediction", "pick", "strict", "pure"].includes(style)) return "prediction";
  return "mixed";
}

function choosePostStyle(match, requestedStyle = "mixed") {
  const style = normalizePostStyle(requestedStyle);
  if (style !== "mixed") return style;
  return rotationIndex(match, 4, "style") === 0 ? "news" : "prediction";
}

function composeSocialPost(match, options = {}) {
  const slug = slugify([match.tour, match.player_a_name, "vs", match.player_b_name].join(" "));
  const url = SITE_URL + "/predictions/" + slug + "/";
  const referral = chooseReferralLink(match, options.referral);
  const hashtags = chooseHashtags(match);
  const followPrompt = chooseFollowPrompt(match);
  const postStyle = options.postStyle || "prediction";
  const news = postStyle === "news" ? options.newsHook : null;
  const pick = match.predicted_winner_name || "value watch";
  const confidence = match.confidence ? String(match.confidence) + "%" : "model";
  const odds = match.predicted_odds ? String(match.predicted_odds) : null;
  const matchTitle = match.player_a_name + " vs " + match.player_b_name;
  const tourLine = [match.tour, match.tournament].filter(Boolean).join(" - ");
  const template = rotationIndex(match, 5, "copy");
  let lead;

  if (news) lead = `Tennis news hook: ${trimToLimit(news.title, 72)}\n${matchTitle}\nAI pick: ${pick} (${confidence}).`;
  else if (template === 0) lead = "Match preview: " + matchTitle + "\n" + tourLine + "\n\nModel pick: " + pick + " (" + confidence + ").";
  else if (template === 1) lead = matchTitle + "\n\nTennisTipz model leans " + pick + " with " + confidence + " confidence.";
  else if (template === 2) lead = "On the board: " + matchTitle + "\n\nPrediction edge: " + pick + " (" + confidence + ").";
  else if (template === 3) lead = matchTitle + "\n" + tourLine + "\n\nAI call: " + pick + ". Confidence: " + confidence + ".";
  else lead = "Tennis prediction watch\n\n" + matchTitle + "\nPick: " + pick + "\nConfidence: " + confidence + ".";

  const oddsLine = odds ? "\nOdds tracked: " + odds + "." : "";
  let text = lead + oddsLine + "\n\nFull prediction: " + url + "\nBetting offer: " + referral.url + "\n\n" + followPrompt + "\nComment your pick. 18+ Bet responsibly. " + hashtags;
  if (text.length > 520) {
    const compactLead = `${matchTitle}\nAI pick: ${pick} (${confidence}).${oddsLine}`;
    text = compactLead + "\n\nPrediction: " + url + "\nOffer: " + referral.url + "\n\n18+ Bet responsibly. " + hashtags;
  }
  return { text, url, referral, hashtags, news, postStyle };
}

function composeTweet(match, options = {}) {
  return composeSocialPost(match, options);
}

function trimToLimit(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
}

function composeThreadsPost(match, options = {}) {
  const language = normalizeThreadsLanguage(options.language);
  const locale = THREADS_LOCALES[language] || THREADS_LOCALES.en;
  const slug = slugify([match.tour, match.player_a_name, "vs", match.player_b_name].join(" "));
  const url = SITE_URL + "/predictions/" + slug + "/";
  const referral = chooseReferralLink(match, options.referral);
  const hashtags = (locale.hashtags || chooseHashtags(match).split(" ").slice(0, 2)).join(" ");
  const postStyle = options.postStyle || "prediction";
  const news = postStyle === "news" ? options.newsHook : null;
  const pick = match.predicted_winner_name || "value watch";
  const confidence = match.confidence ? String(match.confidence) + "%" : "model";
  const odds = match.predicted_odds ? ` | ${locale.odds} ${String(match.predicted_odds)}` : "";
  const matchTitle = match.player_a_name + " vs " + match.player_b_name;
  const engage = locale.engage || "Comment your pick and repost.";
  const newsLine = news ? `${locale.news || "News angle"}: ${trimToLimit(news.title, 118)}\n\n` : "";
  let lead = `${newsLine}${matchTitle}\n${locale.pick}: ${pick} (${confidence})${odds}`;
  let text = `${lead}\n${locale.preview}: ${url}\n${locale.offer}: ${referral.url}\n\n${locale.follow} ${engage} ${locale.responsible} ${hashtags}`;
  if (text.length > 500) {
    if (news) lead = `${locale.news || "News angle"}: ${trimToLimit(news.title, 72)}\n${locale.pick}: ${pick} (${confidence})${odds}`;
    lead = trimToLimit(lead, 500 - (`\n${locale.preview}: ${url}\n${locale.offer}: ${referral.url}\n\n${locale.follow} ${engage} ${locale.responsible}`).length);
    text = `${lead}\n${locale.preview}: ${url}\n${locale.offer}: ${referral.url}\n\n${locale.follow} ${engage} ${locale.responsible}`;
  }
  if (text.length > 500) {
    lead = trimToLimit(`${matchTitle}\n${locale.pick}: ${pick}`, 500 - (`\n${locale.offer}: ${referral.url}\n\n${engage}`).length);
    text = `${lead}\n${locale.offer}: ${referral.url}\n\n${engage}`;
  }
  return { text, url, referral, hashtags, language, languageLabel: locale.label, news, postStyle };
}

async function ensureAutomationTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS automation_posts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      response_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(platform, target_id)
    )
  `).run();
}

async function getPostableMatches(db, limit) {
  const result = await db.prepare(`
    SELECT
      m.id AS match_id,
      m.tour,
      m.tournament,
      m.start_time,
      m.player_a_name,
      m.player_b_name,
      p.id AS prediction_id,
      p.predicted_winner_name,
      p.confidence,
      p.predicted_odds,
      p.created_at
    FROM matches m
    JOIN predictions p ON p.match_id = m.id
    WHERE m.tour IN ('ATP', 'WTA')
      AND p.predicted_winner_name IS NOT NULL
      AND CAST(COALESCE(p.predicted_odds, '0') AS REAL) > ${MIN_PUBLIC_PICK_ODDS}
    ORDER BY m.live DESC, p.created_at DESC, m.start_time ASC
    LIMIT ?
  `).bind(limit).all();
  return result.results || [];
}

async function postTweet(env, text) {
  const headers = { "content-type": "application/json" };
  let authType = "bearer";

  if (hasOAuth1(env)) {
    headers.authorization = await buildOAuth1Header(env, "POST", X_TWEET_URL);
    authType = "oauth1";
  } else {
    const token = env.TWITTER_BEARER_TOKEN || env.X_BEARER_TOKEN || env.TWITTER_ACCESS_TOKEN || env.X_ACCESS_TOKEN;
    if (!token) return { skipped: true, reason: "Missing X OAuth 1.0a credentials or bearer token" };
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(X_TWEET_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, authType, status: response.status, payload };
  return { ok: true, authType, status: response.status, payload };
}

async function getThreadsUser(env) {
  if (env.THREADS_USER_ID) return { id: env.THREADS_USER_ID, source: "env" };
  if (!env.THREADS_ACCESS_TOKEN) return null;

  const response = await fetch(`${THREADS_API_URL}/me?fields=id,username&access_token=${encodeURIComponent(env.THREADS_ACCESS_TOKEN)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) return { error: true, status: response.status, payload };
  return { id: payload.id, username: payload.username || null, source: "me" };
}

async function postThreads(env, text) {
  if (!env.THREADS_ACCESS_TOKEN) return { skipped: true, reason: "Missing THREADS_ACCESS_TOKEN" };

  const user = await getThreadsUser(env);
  if (!user) return { skipped: true, reason: "Missing THREADS_USER_ID or usable Threads token" };
  if (user.error) return { ok: false, phase: "me", status: user.status, payload: user.payload };

  const createResponse = await fetch(`${THREADS_API_URL}/${encodeURIComponent(user.id)}/threads`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ media_type: "TEXT", text, access_token: env.THREADS_ACCESS_TOKEN }),
  });
  const createPayload = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !createPayload.id) return { ok: false, phase: "create", user, status: createResponse.status, payload: createPayload };

  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 3500));
    const publishResponse = await fetch(`${THREADS_API_URL}/${encodeURIComponent(user.id)}/threads_publish`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: createPayload.id, access_token: env.THREADS_ACCESS_TOKEN }),
    });
    const publishPayload = await publishResponse.json().catch(() => ({}));
    attempts.push({ attempt, status: publishResponse.status, payload: publishPayload });
    if (publishResponse.ok) return { ok: true, phase: "publish", user, status: publishResponse.status, payload: publishPayload, creation: createPayload, attempts };

    const subcode = publishPayload?.error?.error_subcode;
    const code = publishPayload?.error?.code;
    const transient = publishPayload?.error?.is_transient === true;
    if (!(transient || code === 2 || code === 24 || subcode === 4279009)) break;
  }

  const last = attempts[attempts.length - 1] || { status: 0, payload: {} };
  return { ok: false, phase: "publish", user, status: last.status, payload: last.payload, creation: createPayload, attempts };
}

async function isAlreadyPosted(db, platform, targetId) {
  const result = await db.prepare("SELECT id FROM automation_posts WHERE platform = ? AND target_id = ? LIMIT 1").bind(platform, targetId).first();
  return Boolean(result);
}

async function recordAutomationPost(db, platform, targetId, url, payload) {
  await db.prepare(`
    INSERT OR IGNORE INTO automation_posts (id, platform, target_type, target_id, url, status, response_json)
    VALUES (?, ?, 'prediction', ?, ?, 'posted', ?)
  `).bind(crypto.randomUUID(), platform, targetId, url, JSON.stringify(payload)).run();
}

async function submitSitemapToGoogle(env) {
  const tokenResult = await getGoogleAccessToken(env);
  if (!tokenResult) return { skipped: true, reason: "Missing GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN or service account env vars" };
  if (tokenResult.error) return { ok: false, phase: "token", status: tokenResult.status, response: tokenResult.payload };

  const site = encodeURIComponent(`${SITE_URL}/`);
  const sitemap = encodeURIComponent(SITEMAP_URL);
  const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${sitemap}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${tokenResult.token}` },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, auth: tokenResult.source, response: text || null, sitemap: SITEMAP_URL };
}

async function promote(request, env) {
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  const platform = ["twitter", "threads", "all"].includes(url.searchParams.get("platform")) ? url.searchParams.get("platform") : "all";
  const referralOverride = url.searchParams.get("ref") || url.searchParams.get("referral") || null;
  const requestedPostStyle = normalizePostStyle(url.searchParams.get("style") || url.searchParams.get("postStyle") || "mixed");
  const threadsLanguage = normalizeThreadsLanguage(url.searchParams.get("lang") || url.searchParams.get("language") || "en");
  const threadsPlatform = threadsPlatformKey(threadsLanguage);
  const postTwitterEnabled = platform === "all" || platform === "twitter";
  const postThreadsEnabled = platform === "all" || platform === "threads";
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "3", 10), 1), 25);
  const db = env.TENNIS_DB;
  await ensureAutomationTable(db);

  const scanLimit = Math.min(Math.max(limit * 20, 50), 150);
  const matches = await getPostableMatches(db, scanLimit);
  const newsHooks = await getRecentNewsHooks(10).catch(() => []);
  const tweets = [];
  const threads = [];

  for (const match of matches) {
    const postStyle = choosePostStyle(match, requestedPostStyle);
    const newsHook = postStyle === "news" ? chooseNewsHook(match, newsHooks) : null;
    const tweet = composeTweet(match, { referral: referralOverride, newsHook, postStyle });
    const threadsPost = composeThreadsPost(match, { referral: referralOverride, language: threadsLanguage, newsHook, postStyle });
    const twitterPosted = await isAlreadyPosted(db, "twitter", match.prediction_id);
    const threadsPosted = await isAlreadyPosted(db, threadsPlatform, match.prediction_id);

    if (postTwitterEnabled && !twitterPosted && tweets.length < limit) {
      if (dryRun) {
        tweets.push({ dryRun: true, predictionId: match.prediction_id, matchId: match.match_id, postStyle: tweet.postStyle, url: tweet.url, referral: tweet.referral, news: tweet.news, text: tweet.text });
      } else {
        const result = await postTweet(env, tweet.text);
        tweets.push({ predictionId: match.prediction_id, matchId: match.match_id, postStyle: tweet.postStyle, url: tweet.url, referral: tweet.referral, news: tweet.news, result });
        if (result.ok) await recordAutomationPost(db, "twitter", match.prediction_id, tweet.url, result.payload);
      }
    }

    if (postThreadsEnabled && !threadsPosted && threads.length < limit) {
      if (dryRun) {
        threads.push({ dryRun: true, predictionId: match.prediction_id, matchId: match.match_id, postStyle: threadsPost.postStyle, url: threadsPost.url, referral: threadsPost.referral, news: threadsPost.news, language: threadsPost.language, languageLabel: threadsPost.languageLabel, text: threadsPost.text });
      } else {
        const result = await postThreads(env, threadsPost.text);
        threads.push({ predictionId: match.prediction_id, matchId: match.match_id, postStyle: threadsPost.postStyle, url: threadsPost.url, referral: threadsPost.referral, news: threadsPost.news, language: threadsPost.language, languageLabel: threadsPost.languageLabel, result });
        if (result.ok) await recordAutomationPost(db, threadsPlatform, match.prediction_id, threadsPost.url, result.payload);
      }
    }

    if ((!postTwitterEnabled || tweets.length >= limit) && (!postThreadsEnabled || threads.length >= limit)) break;
  }

  const google = dryRun ? { dryRun: true, sitemap: SITEMAP_URL } : await submitSitemapToGoogle(env);

  return jsonResponse({
    ok: true,
    dryRun,
    platform,
    requestedPostStyle,
    newsHooks: newsHooks.length,
    checked: matches.length,
    tweets,
    threads,
    google,
    setupRequired: {
      twitter: !hasTwitterAuth(env),
      threads: !hasThreadsAuth(env),
      googleSearchConsole: !(env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN || env.GSC_ACCESS_TOKEN || ((env.GOOGLE_SERVICE_ACCOUNT_EMAIL || env.GSC_SERVICE_ACCOUNT_EMAIL) && (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY))),
    },
  });
}

export async function onRequestPost({ request, env }) {
  return promote(request, env);
}

export async function onRequestGet({ request, env }) {
  return promote(request, env);
}
