const SITE_URL = "https://www.tennistipz.win";
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters";
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

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "match";
}

function base64Url(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function truncateTweet(text) {
  return text.length <= 275 ? text : `${text.slice(0, 272).trim()}...`;
}

function chooseReferralLink(match) {
  if (match.predicted_odds) return REFERRAL_LINKS[0];
  const key = String(match.prediction_id || match.match_id || "");
  const total = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return REFERRAL_LINKS[total % REFERRAL_LINKS.length];
}

function composeTweet(match) {
  const url = `${SITE_URL}/predictions/${slugify(`${match.tour} ${match.player_a_name} vs ${match.player_b_name}`)}/`;
  const referral = chooseReferralLink(match);
  const pick = match.predicted_winner_name || "value watch";
  const confidence = match.confidence ? `${match.confidence}%` : "model";
  const odds = match.predicted_odds ? ` Odds ${match.predicted_odds}.` : "";
  const text = `${match.player_a_name} vs ${match.player_b_name}\n\nAI tennis prediction: ${pick} (${confidence} confidence).${odds}\n\nPreview: ${url}\nBet: ${referral.url}\n\n18+ Bet responsibly. #TennisBetting #TennisTips #CryptoBetting`;
  return { text: truncateTweet(text), url, referral };
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
    LEFT JOIN automation_posts ap ON ap.platform = 'twitter' AND ap.target_id = p.id
    WHERE m.tour IN ('ATP', 'WTA')
      AND ap.id IS NULL
      AND p.predicted_winner_name IS NOT NULL
    ORDER BY m.live DESC, p.created_at DESC, m.start_time ASC
    LIMIT ?
  `).bind(limit).all();
  return result.results || [];
}

async function postTweet(env, text) {
  const token = env.TWITTER_BEARER_TOKEN || env.X_BEARER_TOKEN || env.TWITTER_ACCESS_TOKEN || env.X_ACCESS_TOKEN;
  if (!token) return { skipped: true, reason: "Missing TWITTER_BEARER_TOKEN or X_BEARER_TOKEN" };

  const response = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, payload };
  return { ok: true, status: response.status, payload };
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
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "3", 10), 1), 10);
  const db = env.TENNIS_DB;
  await ensureAutomationTable(db);

  const matches = await getPostableMatches(db, limit);
  const tweets = [];

  for (const match of matches) {
    const tweet = composeTweet(match);
    if (dryRun) {
      tweets.push({ dryRun: true, predictionId: match.prediction_id, matchId: match.match_id, url: tweet.url, referral: tweet.referral, text: tweet.text });
      continue;
    }

    const result = await postTweet(env, tweet.text);
    tweets.push({ predictionId: match.prediction_id, matchId: match.match_id, url: tweet.url, referral: tweet.referral, result });

    if (result.ok) {
      await db.prepare(`
        INSERT OR IGNORE INTO automation_posts (id, platform, target_type, target_id, url, status, response_json)
        VALUES (?, 'twitter', 'prediction', ?, ?, 'posted', ?)
      `).bind(crypto.randomUUID(), match.prediction_id, tweet.url, JSON.stringify(result.payload)).run();
    }
  }

  const google = dryRun ? { dryRun: true, sitemap: SITEMAP_URL } : await submitSitemapToGoogle(env);

  return jsonResponse({
    ok: true,
    dryRun,
    checked: matches.length,
    tweets,
    google,
    setupRequired: {
      twitter: !(env.TWITTER_BEARER_TOKEN || env.X_BEARER_TOKEN || env.TWITTER_ACCESS_TOKEN || env.X_ACCESS_TOKEN),
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
