const SITE_URL = "https://www.tennistipz.win";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const ESPN_TENNIS_RSS = "https://www.espn.com/espn/rss/tennis/news";
const MIN_PUBLIC_PICK_ODDS = 1.4;

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
    .replace(/^-+|-+$/g, "")
    .slice(0, 86) || "tennis-article";
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

async function ensureSeoArticlesTable(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS seo_articles (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        excerpt TEXT,
        body_html TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL UNIQUE,
        source_url TEXT,
        source_title TEXT,
        related_prediction_id TEXT,
        keywords_json TEXT,
        status TEXT NOT NULL DEFAULT 'published',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_seo_articles_created ON seo_articles(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_seo_articles_status ON seo_articles(status, created_at DESC)"),
  ]);
}

async function getEspnNews(limit = 12) {
  const response = await fetch(ESPN_TENNIS_RSS, { headers: { accept: "application/rss+xml, application/xml, text/xml" } });
  if (!response.ok) throw new Error(`ESPN RSS returned ${response.status}`);
  const text = await response.text();
  return text
    .split(/<item\b/i)
    .slice(1, limit + 1)
    .map((item, index) => {
      const title = rssTag(item, "title");
      const summary = rssTag(item, "description");
      const url = rssTag(item, "link") || rssTag(item, "guid") || "";
      const published = new Date(rssTag(item, "pubDate"));
      return title ? {
        type: "news",
        sourceType: "espn-news",
        sourceId: `espn:${slugify(url || title)}`,
        title,
        summary,
        url,
        publishedAt: Number.isNaN(published.getTime()) ? "" : published.toISOString(),
      } : null;
    })
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((candidate) => candidate.sourceId === item.sourceId) === index);
}

async function getPredictionCandidates(db, limit = 12) {
  const result = await db.prepare(`
    SELECT
      m.id AS match_id,
      m.tour,
      m.tournament,
      m.start_time,
      m.status,
      m.live,
      m.surface,
      m.player_a_name,
      m.player_b_name,
      p.id AS prediction_id,
      p.predicted_winner_name,
      p.confidence,
      p.predicted_odds,
      p.model_edge,
      p.factors_json,
      p.created_at
    FROM matches m
    JOIN predictions p ON p.match_id = m.id
    WHERE m.tour IN ('ATP', 'WTA')
      AND p.predicted_winner_name IS NOT NULL
      AND CAST(COALESCE(p.predicted_odds, '0') AS REAL) > ${MIN_PUBLIC_PICK_ODDS}
    ORDER BY m.live DESC, p.created_at DESC, m.start_time ASC
    LIMIT ?
  `).bind(limit).all();

  return (result.results || []).map((match) => {
    let factors = {};
    try { factors = JSON.parse(match.factors_json || "{}"); } catch { factors = {}; }
    const title = `${match.player_a_name} vs ${match.player_b_name}`;
    return {
      type: "prediction",
      sourceType: "prediction",
      sourceId: `prediction:${match.prediction_id}`,
      title,
      url: `${SITE_URL}/predictions/${slugify(`${match.tour} ${title}`)}/`,
      match: {
        ...match,
        aiSummary: factors.aiSummary || "",
        aiReasons: Array.isArray(factors.aiReasons) ? factors.aiReasons : [],
        aiBettingAngle: factors.aiBettingAngle || "",
      },
    };
  });
}

async function sourceAlreadyUsed(db, sourceId) {
  const row = await db.prepare("SELECT id FROM seo_articles WHERE source_id = ? LIMIT 1").bind(sourceId).first();
  return Boolean(row);
}

function fallbackArticle(candidate) {
  const now = new Date().toISOString();
  if (candidate.type === "news") {
    const title = `${candidate.title}: What It Means for Tennis Predictions`;
    const slug = slugify(`${candidate.title} tennis predictions`);
    const description = `TennisTipz analysis of ${candidate.title}, with context for ATP and WTA tennis predictions, player form, and betting research.`;
    const body = [
      `<p>${candidate.summary || candidate.title}</p>`,
      "<h2>Why this tennis news matters</h2>",
      "<p>News can affect confidence, scheduling, match rhythm, and how bettors interpret form. The key is not to react to a headline alone, but to compare it with player stats, tournament context, and upcoming match data.</p>",
      "<h2>Prediction context</h2>",
      "<p>For TennisTipz readers, this story is most useful when it is paired with current ATP and WTA predictions, recent form, surface trends, and market movement. A headline can explain why a match feels different from the raw numbers.</p>",
      "<h2>What to watch next</h2>",
      "<p>Watch the next match schedule, player comments, and whether odds or public sentiment move sharply. Treat every prediction as research rather than certainty.</p>",
    ].join("\n");
    return { title, slug, description, excerpt: description, bodyHtml: body, keywords: ["tennis news", "tennis predictions", "ATP", "WTA"], generatedAt: now };
  }

  const match = candidate.match;
  const title = `${candidate.title} Prediction: Form, Odds and Match Context`;
  const slug = slugify(`${match.tour} ${candidate.title} prediction analysis`);
  const description = `${candidate.title} prediction article with ${match.predicted_winner_name} lean, ${match.confidence}% confidence, ${match.surface || "tennis"} context, and ATP/WTA betting research.`;
  const body = [
    `<p>${match.aiSummary || `TennisTipz currently leans toward ${match.predicted_winner_name} in ${candidate.title}.`}</p>`,
    "<h2>Prediction snapshot</h2>",
    `<p>The model pick is ${match.predicted_winner_name} with ${match.confidence}% confidence. The recorded price is ${match.predicted_odds || "not available"}, and the match is listed for ${match.tournament || "the current tennis schedule"}.</p>`,
    "<h2>Key context</h2>",
    `<p>Surface, form, ranking level, and live status can all change how this prediction should be read. ${match.surface ? `The listed surface is ${match.surface}.` : "Surface data should be checked close to match time."}</p>`,
    "<h2>Responsible betting note</h2>",
    "<p>This article is research only. Tennis predictions are never guaranteed, and bettors should recheck late news, market changes, and player availability before making decisions.</p>",
  ].join("\n");
  return { title, slug, description, excerpt: description, bodyHtml: body, keywords: ["tennis prediction", match.tour, match.player_a_name, match.player_b_name], generatedAt: now };
}

function sanitizeArticlePayload(payload, candidate) {
  const fallback = fallbackArticle(candidate);
  const title = String(payload.title || fallback.title).slice(0, 90);
  const slug = slugify(payload.slug || fallback.slug);
  const description = String(payload.description || fallback.description).slice(0, 160);
  const excerpt = String(payload.excerpt || description).slice(0, 240);
  const bodyHtml = String(payload.bodyHtml || fallback.bodyHtml)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .trim();
  const keywords = Array.isArray(payload.keywords) ? payload.keywords.slice(0, 10).map(String) : fallback.keywords;
  return { ...fallback, title, slug, description, excerpt, bodyHtml, keywords };
}

async function generateArticle(env, candidate) {
  const fallback = fallbackArticle(candidate);
  if (!env.OPENAI_API_KEY || env.ENABLE_OPENAI_AI === "false") return { article: fallback, source: "template", reason: "missing-openai" };

  const promptInput = candidate.type === "news"
    ? {
      sourceType: "ESPN tennis news",
      sourceTitle: candidate.title,
      sourceSummary: candidate.summary,
      sourceUrl: candidate.url,
      instruction: "Write an original SEO article based on the news topic and connect it to tennis predictions, ATP/WTA context, player form, and responsible betting research. Do not copy the source article.",
    }
    : {
      sourceType: "TennisTipz prediction",
      predictionUrl: candidate.url,
      match: candidate.match,
      instruction: "Write an original SEO article based on this prediction and connect it to tennis news, player form, surface context, odds research, and responsible betting. No guaranteed outcomes.",
    };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: "You write original SEO articles for TennisTipz.win. Return strict JSON only with: title, slug, description, excerpt, bodyHtml, keywords. bodyHtml may contain only p, h2, h3, ul, li, strong, em tags. Write 650 to 950 words. Use natural headings, internal-link suggestions in prose, and responsible betting language. Do not plagiarize source text. Do not say guaranteed, lock, sure win, or risk-free.",
        },
        { role: "user", content: JSON.stringify(promptInput) },
      ],
      text: { format: { type: "text" } },
      max_output_tokens: 2200,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { article: fallback, source: "template", reason: `openai-${response.status}`, payload: data };
  const raw = data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text).filter(Boolean).join("\n") || "";
  try {
    return { article: sanitizeArticlePayload(JSON.parse(raw), candidate), source: "openai", model: env.OPENAI_MODEL || "gpt-4o-mini" };
  } catch (error) {
    return { article: fallback, source: "template", reason: `openai-invalid-json: ${error.message}`, raw: raw.slice(0, 500) };
  }
}

async function uniqueSlug(db, baseSlug) {
  let slug = baseSlug;
  for (let index = 2; index < 20; index += 1) {
    const row = await db.prepare("SELECT id FROM seo_articles WHERE slug = ? LIMIT 1").bind(slug).first();
    if (!row) return slug;
    slug = `${baseSlug}-${index}`;
  }
  return `${baseSlug}-${Date.now()}`;
}

async function saveArticle(db, candidate, generation) {
  const article = generation.article;
  const slug = await uniqueSlug(db, article.slug);
  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO seo_articles (
      id, slug, title, description, excerpt, body_html, source_type, source_id,
      source_url, source_title, related_prediction_id, keywords_json, status, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', datetime('now'))
  `).bind(
    id,
    slug,
    article.title,
    article.description,
    article.excerpt,
    article.bodyHtml,
    candidate.sourceType,
    candidate.sourceId,
    candidate.url || null,
    candidate.title || null,
    candidate.match?.prediction_id || null,
    JSON.stringify(article.keywords || [])
  ).run();
  return { id, slug, url: `${SITE_URL}/articles/${slug}/`, ...article };
}

async function generateSeoArticles(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "1", 10), 1), 3);
  const prefer = url.searchParams.get("source") || "mixed";
  const db = env.TENNIS_DB;
  await ensureSeoArticlesTable(db);

  const [news, predictions] = await Promise.all([
    getEspnNews(12).catch(() => []),
    getPredictionCandidates(db, 12),
  ]);
  const ordered = prefer === "news"
    ? [...news, ...predictions]
    : prefer === "prediction" ? [...predictions, ...news] : [...news.slice(0, 4), ...predictions.slice(0, 4), ...news.slice(4), ...predictions.slice(4)];

  const generated = [];
  for (const candidate of ordered) {
    if (generated.length >= limit) break;
    if (await sourceAlreadyUsed(db, candidate.sourceId)) continue;
    const generation = await generateArticle(env, candidate);
    if (dryRun) {
      generated.push({ dryRun: true, candidate, generation });
    } else {
      const saved = await saveArticle(db, candidate, generation);
      generated.push({ candidate, article: saved, generationSource: generation.source, generationReason: generation.reason || null });
    }
  }

  return jsonResponse({
    ok: true,
    dryRun,
    checked: ordered.length,
    generated,
    skipped: generated.length === 0 ? "no-new-news-or-predictions" : null,
  });
}

export async function onRequestPost({ request, env }) {
  return generateSeoArticles(request, env);
}

export async function onRequestGet({ request, env }) {
  return generateSeoArticles(request, env);
}
