const SITE_URL = "https://www.tennistipz.win";
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters";
const X_TWEET_URL = "https://api.twitter.com/2/tweets";
const THREADS_API_URL = "https://graph.threads.net/v1.0";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MIN_PUBLIC_PICK_ODDS = 1.4;
const TOP_PLAYER_POST_RANK = 30;
const DEFAULT_THREADS_TOPIC_TAG = "Tennis Threads";
const SOCIAL_PREVIEW_COUNT = 9;
const NEWS_FEEDS = [
  { name: "ESPN", url: "https://www.espn.com/espn/rss/tennis/news" },
  { name: "TennisHead", url: "https://r.jina.ai/http://https://tennishead.net/feed", type: "jinaMarkdown" },
];
const HUMAN_THREADS_PLATFORM = "threads:human";
const HUMAN_MAX_POST_LENGTH = 450;
const HUMAN_MAX_POSTS_PER_DAY = 6;
const HUMAN_MAX_LINK_POSTS_PER_DAY = 1;
const HUMAN_MIN_POST_INTERVAL_MINUTES = 90;
const HUMAN_EMOTION_WORDS = ["feels", "looks", "underrated", "dangerous", "momentum", "pressure", "nervy", "scrappy", "tight", "swing"];
const HUMAN_SPAM_WORDS = ["odds", "bet", "bets", "betting", "stake", "cloudbet", "bc.game", "affiliate", "offer", "lock", "guaranteed", "sure win", "free pick"];
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

function hasOpenAi(env) {
  return Boolean(env.OPENAI_API_KEY) && env.ENABLE_OPENAI_AI !== "false";
}

function getOpenAiModel(env) {
  return env.OPENAI_MODEL || "gpt-4o-mini";
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

const THREADS_TOPIC_TAGS = {
  en: ["#Tennis", "#TennisPredictions", "#TennisBetting", "#SportsBetting", "#ATP", "#WTA"],
  hi: ["#Tennis", "#TennisPredictions", "#TennisBetting", "#ATP", "#WTA"],
  pt_br: ["#Tenis", "#PalpitesDeTenis", "#ApostasTenis", "#ATP", "#WTA"],
  es: ["#Tenis", "#PronosticosTenis", "#ApuestasTenis", "#ATP", "#WTA"],
  tr: ["#Tenis", "#TenisTahminleri", "#TenisBahisleri", "#ATP", "#WTA"],
};

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

function chooseTopicTags(match, language = "en", platform = "threads") {
  const normalizedLanguage = normalizeThreadsLanguage(language);
  const rawBaseTags = platform === "threads"
    ? (THREADS_TOPIC_TAGS[normalizedLanguage] || THREADS_TOPIC_TAGS.en)
    : HASHTAG_SETS[rotationIndex(match, HASHTAG_SETS.length, "tags")];
  const tour = String(match.tour || "").toUpperCase();
  const baseTags = rawBaseTags.filter((tag) => {
    const upper = String(tag).toUpperCase();
    if (tour === "ATP" && upper === "#WTA") return false;
    if (tour === "WTA" && upper === "#ATP") return false;
    return true;
  });
  const tags = [...baseTags];
  if (tour && !tags.includes(`#${tour}`)) tags.push(`#${tour}`);
  const start = rotationIndex(match, tags.length, `topic:${platform}:${normalizedLanguage}`);
  const rotated = [...tags.slice(start), ...tags.slice(0, start)];
  const selected = rotated.filter((tag, index, list) => list.indexOf(tag) === index).slice(0, 4);
  return selected.length >= 2 ? selected : ["#Tennis", "#TennisPredictions", "#TennisBetting"];
}

function socialPreviewIndex(match, salt = "") {
  return rotationIndex(match, SOCIAL_PREVIEW_COUNT, `preview:${salt}`) + 1;
}

function predictionUrl(match, salt = "") {
  const slug = slugify([match.tour, match.player_a_name, "vs", match.player_b_name].join(" "));
  return `${SITE_URL}/predictions/${slug}/?preview=${socialPreviewIndex(match, salt)}`;
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
  const names = [match.player_a_name, match.player_b_name].filter(Boolean);
  const relatedHooks = newsHooks.filter((news) => textMentionsAnyName(`${news.title || ""} ${news.summary || ""}`, names));
  if (!relatedHooks.length) return null;
  return relatedHooks[rotationIndex(match, relatedHooks.length, "news")];
}

function textMentionsAnyName(text, names = []) {
  const haystack = String(text || "").toLowerCase();
  return names.some((name) => {
    const parts = String(name || "").toLowerCase().split(/\s+/).filter((part) => part.length > 2);
    return parts.length && (haystack.includes(parts.join(" ")) || parts.some((part) => haystack.includes(part)));
  });
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
  const url = predictionUrl(match, options.platform || "twitter");
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

function extractHashtags(text) {
  return String(text || "").match(/#[\p{L}\p{N}_]+/gu) || [];
}

async function getEspnNewsHooks(limit = 8) {
  const espn = NEWS_FEEDS.find((feed) => feed.name === "ESPN");
  if (!espn) return [];
  return getNewsHooksFromFeed(espn, limit).catch(() => []);
}

function appendTopicTags(text, topicTags = [], maxLength = 500) {
  const existing = new Set(extractHashtags(text).map((tag) => tag.toLowerCase()));
  const missing = topicTags.filter((tag) => !existing.has(String(tag).toLowerCase()));
  const currentCount = existing.size;
  if (currentCount >= 2) return text;

  let clean = String(text || "").trim();
  const needed = missing.slice(0, Math.max(0, 2 - currentCount) || 2);
  for (const tag of needed) {
    const candidate = `${clean}${clean ? " " : ""}${tag}`.trim();
    if (candidate.length <= maxLength) clean = candidate;
  }
  return clean;
}

function sanitizeAiPost(text, maxLength, requiredLinks = [], topicTags = []) {
  let clean = String(text || "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)\n]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)\n]*/g, "$1")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  for (const link of requiredLinks) {
    if (link) clean += `\n${link}`;
  }
  const lower = clean.toLowerCase();
  const requiredSafety = [];
  if (!lower.includes("18+") && !lower.includes("responsib")) requiredSafety.push("18+ Bet responsibly.");
  if (!(lower.includes("follow") && lower.includes("comment") && lower.includes("repost"))) requiredSafety.push("Follow, comment and repost.");
  if (requiredSafety.length) clean += `\n${requiredSafety.join(" ")}`;
  clean = appendTopicTags(clean, topicTags, maxLength);
  clean = clean.replace(/\bguaranteed\b/gi, "model-backed").replace(/\bsure win\b/gi, "prediction");
  if (clean.length <= maxLength) return clean;
  const tagSuffix = topicTags.slice(0, 3).join(" ");
  const suffix = requiredLinks.filter(Boolean).join("\n") + `\n18+ Bet responsibly. Follow, comment and repost. ${tagSuffix}`.trimEnd();
  const lead = trimToLimit(clean.split(/\n{2,}/)[0] || clean, Math.max(40, maxLength - suffix.length - 2));
  return `${lead}\n${suffix}`;
}

async function callOpenAiPost(env, payload, fallbackText, maxLength) {
  if (!hasOpenAi(env)) return { text: fallbackText, source: "template", reason: "missing-openai" };
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: getOpenAiModel(env),
      input: [
        {
          role: "system",
          content: "You write short, catchy tennis prediction social posts for TennisTipz. Use only supplied facts. Always include both supplied links exactly once: the prediction link and the affiliate/referral link. For Threads, end with 2 to 4 popular topic tags/hashtags selected from the supplied suggestedPopularTopicTags list when possible. For other platforms, include 2 to 4 popular, relevant hashtags for the platform, language, tour, and betting context. Never guarantee results. Mention 18+ and responsible betting. Urge users to follow, comment, and repost. Match the requested language. Return only the final post text.",
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
      text: { format: { type: "text" } },
      max_output_tokens: 260,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { text: fallbackText, source: "template", reason: `openai-${response.status}`, payload: data };
  const raw = data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text).filter(Boolean).join("\n") || "";
  const text = sanitizeAiPost(raw, maxLength, [payload.predictionUrl, payload.referral?.url], payload.suggestedPopularTopicTags || []);
  if (!text || !payload.predictionUrl || !payload.referral?.url || !text.includes(payload.predictionUrl) || !text.includes(payload.referral.url)) {
    return { text: fallbackText, source: "template", reason: "openai-missing-required-links" };
  }
  return { text, source: "openai", model: getOpenAiModel(env) };
}

function hasLink(text) {
  return /https?:\/\//i.test(String(text || "")) || String(text || "").toLowerCase().includes("tennistipz.win/");
}

function hashtagCount(text) {
  return (String(text || "").match(/#[\p{L}\p{N}_]+/gu) || []).length;
}

function wordHitCount(text, words) {
  const lower = String(text || "").toLowerCase();
  return words.reduce((count, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return count + (new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(lower) ? 1 : 0);
  }, 0);
}

function normalizeTextForDuplicate(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(left, right) {
  const leftTokens = new Set(normalizeTextForDuplicate(left).split(" ").filter((token) => token.length > 3));
  const rightTokens = normalizeTextForDuplicate(right).split(" ").filter((token) => token.length > 3);
  if (!leftTokens.size || !rightTokens.length) return 0;
  return rightTokens.filter((token) => leftTokens.has(token)).length / Math.max(leftTokens.size, rightTokens.length);
}

function humanPostScore(text) {
  const clean = String(text || "").trim();
  let score = 0;
  const reasons = [];
  if (clean.includes("?")) { score += 18; reasons.push("question"); }
  if (clean.length <= 280) { score += 14; reasons.push("under-280"); }
  else if (clean.length <= HUMAN_MAX_POST_LENGTH) { score += 5; reasons.push("under-450"); }
  else { score -= 40; reasons.push("too-long"); }
  const emotionHits = wordHitCount(clean, HUMAN_EMOTION_WORDS);
  if (emotionHits) { score += emotionHits * 7; reasons.push(`emotion-${emotionHits}`); }
  if (/\b(who|what|am i|anyone|agree|disagree|tell me|which)\b/i.test(clean)) { score += 8; reasons.push("reply-hook"); }
  if (hasLink(clean)) { score -= 25; reasons.push("link"); }
  const tags = hashtagCount(clean);
  if (tags > 1) { score -= tags * 8; reasons.push(`hashtags-${tags}`); }
  const spamHits = wordHitCount(clean, HUMAN_SPAM_WORDS);
  if (spamHits) { score -= spamHits * 18; reasons.push(`spam-${spamHits}`); }
  return { score, reasons };
}

function cleanHumanPostText(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:cloudbet|bc\.game|stake\.com|affiliate|referral|odds|betting offer|place a bet)\b/gi, "")
    .replace(/\b(?:guaranteed|lock|sure win|free pick)\b/gi, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, HUMAN_MAX_POST_LENGTH);
}

function fallbackHumanVariants(candidate) {
  if (candidate.type === "news") {
    const title = candidate.news.title;
    return [
      { type: "hot_take", text: `This tennis headline feels like one of those stories where the reaction says more than the result. ${trimToLimit(title, 120)} What are people missing here?` },
      { type: "stat_angle", text: `The underrated part of this story is how much momentum can change around one match week. ${trimToLimit(title, 110)} Does this shift your read?` },
      { type: "live_match_reaction", text: `This looks like a classic tennis pressure moment: everyone sees the headline, but the next match tells us what is real.` },
      { type: "debate_question", text: `${trimToLimit(title, 150)} Fair reaction or are tennis fans overdoing it again?` },
      { type: "soft_prediction", text: `Soft read: this story probably matters more for confidence than rankings. Tennis has a way of making small momentum swings feel huge.` },
    ];
  }

  const match = candidate.match;
  const title = `${match.player_a_name} vs ${match.player_b_name}`;
  const pick = match.predicted_winner_name || "the form player";
  return [
    { type: "hot_take", text: `${title} feels way more dangerous than the card suggests. One momentum swing and this gets uncomfortable fast. Am I overthinking it?` },
    { type: "stat_angle", text: `The surface angle matters here. If the first-serve numbers dip, ${title} can flip quickly. Who handles pressure better?` },
    { type: "live_match_reaction", text: `This has that tense tennis energy where one loose service game suddenly feels massive. Momentum might decide the whole thing.` },
    { type: "debate_question", text: `${title}: who is actually more underrated in this matchup? I can see the case both ways if the rallies get longer.` },
    { type: "soft_prediction", text: `Soft lean toward ${pick}, but not in an obvious way. This looks like patience and pressure tolerance more than highlight shots.` },
  ];
}

async function callOpenAiHumanVariants(env, candidate) {
  const fallback = fallbackHumanVariants(candidate);
  if (!hasOpenAi(env)) return { source: "template", variants: fallback, reason: "missing-openai" };

  const input = candidate.type === "news"
    ? { contentType: "ESPN tennis news", news: candidate.news }
    : {
      contentType: "TennisTipz prediction",
      prediction: {
        tournament: candidate.match.tournament,
        surface: candidate.match.surface || null,
        player1: candidate.match.player_a_name,
        player2: candidate.match.player_b_name,
        score: candidate.match.live ? "live" : "upcoming",
        playerRanks: {
          [candidate.match.player_a_name]: candidate.match.player_a_rank || null,
          [candidate.match.player_b_name]: candidate.match.player_b_rank || null,
        },
        topRankFilter: TOP_PLAYER_POST_RANK,
        stats: {
          recent_form: candidate.match.ai_summary || null,
          confidence: candidate.match.confidence || null,
        },
        prediction: {
          lean: candidate.match.predicted_winner_name,
          confidence: candidate.match.confidence ? `${candidate.match.confidence}%` : "medium",
          reason: candidate.match.ai_betting_angle || candidate.match.ai_summary || "Model leans this side based on current match data.",
        },
      },
    };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: getOpenAiModel(env),
      input: [
        {
          role: "system",
          content: "Create authentic human tennis-fan Threads posts for TennisTipz. Use only supplied Top ATP/WTA 30 player or match context. Return strict JSON only: {\"variants\":[{\"type\":\"hot_take|stat_angle|live_match_reaction|debate_question|soft_prediction\",\"text\":\"...\"}]}. Create exactly 5 variants, one of each type. Max 450 characters each. No links, URLs, affiliate names, referral language, odds, betting offers, or calls to bet. Do not use guaranteed, lock, or sure win. No hashtags unless very natural. Sound opinionated, casual, and reply-worthy, like a real tennis fan starting a conversation. Mention tennistipz.win only rarely and naturally.",
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: { format: { type: "text" } },
      max_output_tokens: 900,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { source: "template", variants: fallback, reason: `openai-${response.status}`, payload: data };
  const raw = data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text).filter(Boolean).join("\n") || "";
  try {
    const parsed = JSON.parse(raw);
    const variants = (parsed.variants || []).map((variant) => ({ type: variant.type || "variant", text: cleanHumanPostText(variant.text) })).filter((variant) => variant.text);
    return variants.length ? { source: "openai", variants, model: getOpenAiModel(env) } : { source: "template", variants: fallback, reason: "openai-empty-variants" };
  } catch (error) {
    return { source: "template", variants: fallback, reason: `openai-invalid-json: ${error.message}`, raw: raw.slice(0, 500) };
  }
}

async function composeAiSocialPost(env, match, options = {}) {
  const platform = options.platform || "threads";
  const language = options.language ? normalizeThreadsLanguage(options.language) : "en";
  const locale = THREADS_LOCALES[language] || THREADS_LOCALES.en;
  const base = platform === "threads" ? composeThreadsPost(match, options) : composeSocialPost(match, options);
  const maxLength = platform === "twitter" ? 280 : 500;
  const topicTags = platform === "threads"
    ? chooseTopicTags(match, language, platform)
    : chooseHashtags(match).split(" ");
  const payload = {
    platform,
    language: locale.label || "English",
    postStyle: base.postStyle,
    predictionUrl: base.url,
    referral: base.referral,
    match: {
      tour: match.tour,
      tournament: match.tournament,
      startTime: match.start_time,
      players: [match.player_a_name, match.player_b_name],
      playerRanks: {
        [match.player_a_name]: match.player_a_rank || null,
        [match.player_b_name]: match.player_b_rank || null,
      },
      topRankFilter: TOP_PLAYER_POST_RANK,
      pick: match.predicted_winner_name,
      confidence: match.confidence,
      odds: match.predicted_odds,
    },
    newsHook: base.news ? { title: base.news.title, source: base.news.source, url: base.news.url } : null,
    requiredCallToAction: locale.engage || "Comment your pick and repost for more tennis predictions.",
    suggestedPopularTopicTags: topicTags,
    hashtagInstruction: platform === "threads"
      ? "End the post with 2 to 4 popular Threads topic tags from suggestedPopularTopicTags. Keep them visible in the final text."
      : "Choose 2 to 4 popular, relevant hashtags for this post in the requested language and platform.",
  };
  const ai = await callOpenAiPost(env, payload, base.text, maxLength);
  return { ...base, language, languageLabel: locale.label, text: ai.text, ai };
}

function composeThreadsPost(match, options = {}) {
  const language = normalizeThreadsLanguage(options.language);
  const locale = THREADS_LOCALES[language] || THREADS_LOCALES.en;
  const url = predictionUrl(match, `threads:${language}`);
  const referral = chooseReferralLink(match, options.referral);
  const topicTags = chooseTopicTags(match, language, "threads");
  const hashtags = topicTags.join(" ");
  const postStyle = options.postStyle || "prediction";
  const news = postStyle === "news" ? options.newsHook : null;
  const pick = match.predicted_winner_name || "value watch";
  const confidence = match.confidence ? String(match.confidence) + "%" : "model";
  const odds = match.predicted_odds ? ` | ${locale.odds} ${String(match.predicted_odds)}` : "";
  const matchTitle = match.player_a_name + " vs " + match.player_b_name;
  const engage = locale.engage || "Comment your pick and repost.";
  const newsLine = news ? `${locale.news || "News angle"}: ${trimToLimit(news.title, 118)}\n\n` : "";
  let lead = `${newsLine}${matchTitle}\n${locale.pick}: ${pick} (${confidence})${odds}`;
  const suffix = `${locale.follow} ${engage} ${locale.responsible} ${hashtags}`;
  let text = `${lead}\n${locale.preview}: ${url}\n${locale.offer}: ${referral.url}\n\n${suffix}`;
  if (text.length > 500) {
    if (news) lead = `${locale.news || "News angle"}: ${trimToLimit(news.title, 72)}\n${locale.pick}: ${pick} (${confidence})${odds}`;
    lead = trimToLimit(lead, 500 - (`\n${locale.preview}: ${url}\n${locale.offer}: ${referral.url}\n\n${suffix}`).length);
    text = `${lead}\n${locale.preview}: ${url}\n${locale.offer}: ${referral.url}\n\n${suffix}`;
  }
  if (text.length > 500) {
    const compactSuffix = `${engage} ${locale.responsible} ${hashtags}`;
    lead = trimToLimit(`${matchTitle}\n${locale.pick}: ${pick}`, 500 - (`\n${locale.offer}: ${referral.url}\n\n${compactSuffix}`).length);
    text = `${lead}\n${locale.offer}: ${referral.url}\n\n${compactSuffix}`;
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
      m.live,
      m.surface,
      m.player_a_name,
      m.player_b_name,
      pa.current_rank AS player_a_rank,
      pb.current_rank AS player_b_rank,
      p.id AS prediction_id,
      p.predicted_winner_name,
      p.confidence,
      p.predicted_odds,
      p.created_at,
      p.factors_json
    FROM matches m
    JOIN predictions p ON p.match_id = m.id
    LEFT JOIN players pa ON pa.tour = m.tour AND pa.normalized_name = m.normalized_player_a
    LEFT JOIN players pb ON pb.tour = m.tour AND pb.normalized_name = m.normalized_player_b
    WHERE m.tour IN ('ATP', 'WTA')
      AND p.predicted_winner_name IS NOT NULL
      AND CAST(COALESCE(p.predicted_odds, '0') AS REAL) > ${MIN_PUBLIC_PICK_ODDS}
      AND (
        CAST(COALESCE(pa.current_rank, 999999) AS INTEGER) BETWEEN 1 AND ${TOP_PLAYER_POST_RANK}
        OR CAST(COALESCE(pb.current_rank, 999999) AS INTEGER) BETWEEN 1 AND ${TOP_PLAYER_POST_RANK}
      )
    ORDER BY m.live DESC, p.created_at DESC, m.start_time ASC
    LIMIT ?
  `).bind(limit).all();
  return (result.results || []).map((match) => {
    let factors = {};
    try { factors = JSON.parse(match.factors_json || "{}"); } catch { factors = {}; }
    return {
      ...match,
      ai_summary: factors.aiSummary || null,
      ai_betting_angle: factors.aiBettingAngle || null,
    };
  });
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
  const topicTag = String(env.THREADS_TOPIC_TAG || DEFAULT_THREADS_TOPIC_TAG).trim();
  const createBody = new URLSearchParams({ media_type: "TEXT", text, access_token: env.THREADS_ACCESS_TOKEN });
  if (topicTag) createBody.set("topic_tag", topicTag.replace(/^#/, ""));

  const createResponse = await fetch(`${THREADS_API_URL}/${encodeURIComponent(user.id)}/threads`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: createBody,
  });
  const createPayload = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !createPayload.id) return { ok: false, phase: "create", user, topicTag, status: createResponse.status, payload: createPayload };

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
    if (publishResponse.ok) return { ok: true, phase: "publish", user, topicTag, status: publishResponse.status, payload: publishPayload, creation: createPayload, attempts };

    const subcode = publishPayload?.error?.error_subcode;
    const code = publishPayload?.error?.code;
    const transient = publishPayload?.error?.is_transient === true;
    if (!(transient || code === 2 || code === 24 || subcode === 4279009)) break;
  }

  const last = attempts[attempts.length - 1] || { status: 0, payload: {} };
  return { ok: false, phase: "publish", user, topicTag, status: last.status, payload: last.payload, creation: createPayload, attempts };
}

async function getTopPlayerNames(db, limit = TOP_PLAYER_POST_RANK) {
  const result = await db.prepare(`
    SELECT name
    FROM players
    WHERE tour IN ('ATP', 'WTA')
      AND CAST(COALESCE(current_rank, 999999) AS INTEGER) BETWEEN 1 AND ?
    ORDER BY tour ASC, current_rank ASC
  `).bind(limit).all();
  return (result.results || []).map((player) => player.name).filter(Boolean);
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

async function getRecentAutomationPosts(db, platform, hours = 24) {
  const result = await db.prepare(`
    SELECT platform, target_type, target_id, url, response_json, created_at
    FROM automation_posts
    WHERE platform = ?
      AND created_at >= datetime('now', ?)
    ORDER BY created_at DESC
  `).bind(platform, `-${hours} hours`).all();
  return result.results || [];
}

function parsePostedText(row) {
  try {
    const payload = JSON.parse(row.response_json || "{}");
    return payload.selectedPost || payload.text || payload.post || "";
  } catch {
    return "";
  }
}

async function recordHumanAutomationPost(db, candidate, selected, publishResult, generation) {
  const targetType = candidate.type === "news" ? "news" : "prediction";
  const targetId = candidate.targetId;
  const url = candidate.url || SITE_URL;
  const payload = {
    selectedPost: selected.text,
    selectedType: selected.type,
    score: selected.score,
    scoreReasons: selected.reasons,
    generatedVariants: generation.scored,
    generationSource: generation.source,
    generationReason: generation.reason || null,
    match: candidate.match || null,
    news: candidate.news || null,
    publishResult,
  };
  await db.prepare(`
    INSERT OR IGNORE INTO automation_posts (id, platform, target_type, target_id, url, status, response_json)
    VALUES (?, ?, ?, ?, ?, 'posted', ?)
  `).bind(crypto.randomUUID(), HUMAN_THREADS_PLATFORM, targetType, targetId, url, JSON.stringify(payload)).run();
}

function humanPostingRules(recentRows, text) {
  const reasons = [];
  const now = Date.now();
  const dayRows = recentRows.filter((row) => now - Date.parse(row.created_at) < 24 * 60 * 60 * 1000);
  if (dayRows.length >= HUMAN_MAX_POSTS_PER_DAY) reasons.push(`daily-limit-${HUMAN_MAX_POSTS_PER_DAY}`);
  const linkRows = dayRows.filter((row) => hasLink(parsePostedText(row)));
  if (hasLink(text) && linkRows.length >= HUMAN_MAX_LINK_POSTS_PER_DAY) reasons.push(`daily-link-limit-${HUMAN_MAX_LINK_POSTS_PER_DAY}`);
  const latest = recentRows[0];
  if (latest) {
    const minutes = (now - Date.parse(latest.created_at)) / 60000;
    if (minutes < HUMAN_MIN_POST_INTERVAL_MINUTES) reasons.push(`interval-${Math.round(minutes)}-of-${HUMAN_MIN_POST_INTERVAL_MINUTES}`);
  }
  const duplicate = recentRows.find((row) => tokenOverlap(text, parsePostedText(row)) >= 0.72);
  if (duplicate) reasons.push("duplicate-wording");
  return { ok: reasons.length === 0, reasons };
}

function selectHumanCandidate(matches, newsHooks) {
  const candidates = [];
  for (const match of matches.slice(0, 8)) {
    candidates.push({
      type: "prediction",
      targetId: `prediction:${match.prediction_id}`,
      url: predictionUrl(match, "human"),
      match,
    });
  }
  for (const news of newsHooks.slice(0, 8)) {
    candidates.push({
      type: "news",
      targetId: `news:${slugify(news.url || news.title || news.id || "espn")}`,
      url: news.url,
      news,
    });
  }
  if (!candidates.length) return null;
  const slot = Math.floor(Date.now() / (90 * 60 * 1000));
  return candidates[slot % candidates.length];
}

async function promoteHumanThreads(request, env, dryRun) {
  const db = env.TENNIS_DB;
  await ensureAutomationTable(db);
  const recentRows = await getRecentAutomationPosts(db, HUMAN_THREADS_PLATFORM, 72);
  const postedTargets = new Set(recentRows.map((row) => row.target_id));
  const matches = (await getPostableMatches(db, 30)).filter((match) => !postedTargets.has(`prediction:${match.prediction_id}`));
  const topPlayerNames = await getTopPlayerNames(db);
  const newsHooks = (await getEspnNewsHooks(12))
    .filter((news) => !postedTargets.has(`news:${slugify(news.url || news.title || news.id || "espn")}`))
    .filter((news) => textMentionsAnyName(`${news.title || ""} ${news.summary || ""}`, topPlayerNames));
  const candidate = selectHumanCandidate(matches, newsHooks);
  if (!candidate) {
    return jsonResponse({ ok: true, dryRun, mode: "human-threads", skipped: true, reason: "no-unposted-predictions-or-espn-news" });
  }

  const generation = await callOpenAiHumanVariants(env, candidate);
  const scored = generation.variants
    .map((variant) => {
      const clean = cleanHumanPostText(variant.text);
      return { ...variant, text: clean, ...humanPostScore(clean) };
    })
    .sort((left, right) => right.score - left.score);
  const selected = scored[0];
  const rules = humanPostingRules(recentRows, selected.text);
  const publishResult = dryRun
    ? { dryRun: true, ok: false, reason: "dry-run" }
    : rules.ok ? await postThreads(env, selected.text) : { skipped: true, ok: false, reasons: rules.reasons };

  if (!dryRun && publishResult.ok) await recordHumanAutomationPost(db, candidate, selected, publishResult, { ...generation, scored });

  return jsonResponse({
    ok: true,
    dryRun,
    mode: "human-threads",
    source: candidate.type,
    candidate,
    generatedVariants: scored,
    selectedPost: selected.text,
    selectedType: selected.type,
    score: selected.score,
    scoreReasons: selected.reasons,
    rules,
    publishResult,
    generationSource: generation.source,
    generationReason: generation.reason || null,
    recentHumanPosts: recentRows.length,
  });
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
  const humanMode = url.searchParams.get("mode") === "human" || url.searchParams.get("human") === "1" || url.searchParams.get("human") === "true";
  const platform = ["twitter", "threads", "all"].includes(url.searchParams.get("platform")) ? url.searchParams.get("platform") : "all";
  const referralOverride = url.searchParams.get("ref") || url.searchParams.get("referral") || null;
  const requestedPostStyle = normalizePostStyle(url.searchParams.get("style") || url.searchParams.get("postStyle") || "mixed");
  const useAiPosts = url.searchParams.get("ai") !== "0" && url.searchParams.get("ai") !== "false";
  const threadsLanguage = normalizeThreadsLanguage(url.searchParams.get("lang") || url.searchParams.get("language") || "en");
  const threadsPlatform = threadsPlatformKey(threadsLanguage);
  const postTwitterEnabled = platform === "all" || platform === "twitter";
  const postThreadsEnabled = platform === "all" || platform === "threads";
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "3", 10), 1), 25);
  const db = env.TENNIS_DB;
  await ensureAutomationTable(db);

  if (humanMode && platform === "threads") return promoteHumanThreads(request, env, dryRun);

  const scanLimit = Math.min(Math.max(limit * 20, 50), 150);
  const matches = await getPostableMatches(db, scanLimit);
  const newsHooks = await getRecentNewsHooks(10).catch(() => []);
  const tweets = [];
  const threads = [];

  for (const match of matches) {
    const postStyle = choosePostStyle(match, requestedPostStyle);
    const newsHook = postStyle === "news" ? chooseNewsHook(match, newsHooks) : null;
    const tweet = useAiPosts
      ? await composeAiSocialPost(env, match, { platform: "twitter", referral: referralOverride, newsHook, postStyle })
      : composeTweet(match, { referral: referralOverride, newsHook, postStyle });
    const threadsPost = useAiPosts
      ? await composeAiSocialPost(env, match, { platform: "threads", referral: referralOverride, language: threadsLanguage, newsHook, postStyle })
      : composeThreadsPost(match, { referral: referralOverride, language: threadsLanguage, newsHook, postStyle });
    const twitterPosted = await isAlreadyPosted(db, "twitter", match.prediction_id);
    const threadsPosted = await isAlreadyPosted(db, threadsPlatform, match.prediction_id);

    if (postTwitterEnabled && !twitterPosted && tweets.length < limit) {
      if (dryRun) {
        tweets.push({ dryRun: true, predictionId: match.prediction_id, matchId: match.match_id, rankContext: { playerA: match.player_a_rank || null, playerB: match.player_b_rank || null, topRankFilter: TOP_PLAYER_POST_RANK }, postStyle: tweet.postStyle, url: tweet.url, referral: tweet.referral, news: tweet.news, ai: tweet.ai, text: tweet.text });
      } else {
        const result = await postTweet(env, tweet.text);
        tweets.push({ predictionId: match.prediction_id, matchId: match.match_id, postStyle: tweet.postStyle, url: tweet.url, referral: tweet.referral, news: tweet.news, ai: tweet.ai, result });
        if (result.ok) await recordAutomationPost(db, "twitter", match.prediction_id, tweet.url, result.payload);
      }
    }

    if (postThreadsEnabled && !threadsPosted && threads.length < limit) {
      if (dryRun) {
        threads.push({ dryRun: true, predictionId: match.prediction_id, matchId: match.match_id, rankContext: { playerA: match.player_a_rank || null, playerB: match.player_b_rank || null, topRankFilter: TOP_PLAYER_POST_RANK }, postStyle: threadsPost.postStyle, url: threadsPost.url, referral: threadsPost.referral, news: threadsPost.news, language: threadsPost.language, languageLabel: threadsPost.languageLabel, ai: threadsPost.ai, text: threadsPost.text });
      } else {
        const result = await postThreads(env, threadsPost.text);
        threads.push({ predictionId: match.prediction_id, matchId: match.match_id, rankContext: { playerA: match.player_a_rank || null, playerB: match.player_b_rank || null, topRankFilter: TOP_PLAYER_POST_RANK }, postStyle: threadsPost.postStyle, url: threadsPost.url, referral: threadsPost.referral, news: threadsPost.news, language: threadsPost.language, languageLabel: threadsPost.languageLabel, ai: threadsPost.ai, result });
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
    aiPosts: useAiPosts && hasOpenAi(env) ? "enabled" : useAiPosts ? "fallback-template" : "disabled",
    topRankFilter: TOP_PLAYER_POST_RANK,
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
