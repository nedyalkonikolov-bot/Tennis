const SITE_URL = "https://www.tennistipz.win";
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;

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

function truncateTweet(text) {
  return text.length <= 275 ? text : `${text.slice(0, 272).trim()}...`;
}

function composeTweet(match) {
  const url = `${SITE_URL}/predictions/${slugify(`${match.tour} ${match.player_a_name} vs ${match.player_b_name}`)}/`;
  const pick = match.predicted_winner_name || "value watch";
  const confidence = match.confidence ? `${match.confidence}%` : "model";
  const odds = match.predicted_odds ? ` Odds ${match.predicted_odds}.` : "";
  const text = `${match.player_a_name} vs ${match.player_b_name}\n\nAI tennis prediction: ${pick} (${confidence} confidence).${odds}\n\n${url}\n\n18+ Bet responsibly. #TennisBetting #TennisTips #CryptoBetting`;
  return { text: truncateTweet(text), url };
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
  const token = env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN || env.GSC_ACCESS_TOKEN;
  if (!token) return { skipped: true, reason: "Missing GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN" };

  const site = encodeURIComponent(`${SITE_URL}/`);
  const sitemap = encodeURIComponent(SITEMAP_URL);
  const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${sitemap}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, response: text || null, sitemap: SITEMAP_URL };
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
      tweets.push({ dryRun: true, matchId: match.match_id, url: tweet.url, text: tweet.text });
      continue;
    }

    const result = await postTweet(env, tweet.text);
    tweets.push({ matchId: match.match_id, url: tweet.url, result });

    if (result.ok) {
      await db.prepare(`
        INSERT OR IGNORE INTO automation_posts (id, platform, target_type, target_id, url, status, response_json)
        VALUES (?, 'twitter', 'prediction', ?, ?, 'posted', ?)
      `).bind(crypto.randomUUID(), `${match.match_id}:twitter`, tweet.url, JSON.stringify(result.payload)).run();
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
      googleSearchConsole: !(env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN || env.GSC_ACCESS_TOKEN),
    },
  });
}

export async function onRequestPost({ request, env }) {
  return promote(request, env);
}

export async function onRequestGet({ request, env }) {
  return promote(request, env);
}
