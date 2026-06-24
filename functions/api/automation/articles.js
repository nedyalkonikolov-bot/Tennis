const SITE_URL = "https://www.tennistipz.win";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const ESPN_TENNIS_RSS = "https://www.espn.com/espn/rss/tennis/news";
const VALID_CONTENT_TYPES = new Set(["match_prediction", "player_analysis", "tournament_preview", "news_reaction", "evergreen_article"]);
const DEFAULT_MODEL = "gpt-5.4-mini";
const SEO_MIN_WORDS = {
  match_prediction: 650,
  player_analysis: 750,
  tournament_preview: 750,
  news_reaction: 750,
  evergreen_article: 900,
};
const SEO_MAX_META_TITLE = 60;
const SEO_MIN_META_TITLE = 30;
const SEO_MIN_META_DESCRIPTION = 120;
const SEO_MAX_META_DESCRIPTION = 160;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isAuthorized(request, env) {
  const expected = env.DATABASE_SYNC_TOKEN || env.SYNC_TOKEN;
  if (!expected) return false;
  const url = new URL(request.url);
  const token = request.headers.get("x-sync-token") || url.searchParams.get("token");
  return token && token === expected;
}

function isEnabled(env, url) {
  const override = url.searchParams.get("enabled");
  if (override !== null) return override === "1" || override === "true";
  return String(env.CONTENT_AUTOPUBLISH_ENABLED || "false").toLowerCase() === "true";
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

function toJson(value) {
  return JSON.stringify(value ?? []);
}

function plainText(value = "") {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value = "") {
  const text = plainText(value);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function includesText(haystack = "", needle = "") {
  return String(haystack || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

function parseCount(value, fallback = 0, max = 5) {
  const count = Number.parseInt(value ?? fallback, 10);
  if (!Number.isFinite(count)) return fallback;
  return Math.max(0, Math.min(count, max));
}

function getCounts(env, url) {
  const totalLimit = url.searchParams.get("limit");
  if (totalLimit) return { evergreen_article: parseCount(totalLimit, 1, 5) };
  return {
    match_prediction: parseCount(url.searchParams.get("matchPredictions") ?? env.DAILY_MATCH_PREDICTIONS_COUNT, 1, 5),
    player_analysis: parseCount(url.searchParams.get("playerAnalysis") ?? env.DAILY_PLAYER_ANALYSIS_COUNT, 1, 5),
    tournament_preview: parseCount(url.searchParams.get("tournamentPreviews") ?? env.DAILY_TOURNAMENT_PREVIEWS_COUNT, 1, 5),
    news_reaction: parseCount(url.searchParams.get("newsReactions") ?? env.DAILY_NEWS_REACTIONS_COUNT, 1, 5),
    evergreen_article: parseCount(url.searchParams.get("evergreenArticles") ?? env.DAILY_EVERGREEN_ARTICLES_COUNT, 1, 5),
  };
}

async function columnExists(db, tableName, columnName) {
  const info = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  return (info.results || []).some((column) => column.name === columnName);
}

async function ensureAutomationTables(db) {
  await db.prepare(`
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
  `).run();

  const columns = [
    ["content_type", "TEXT"],
    ["published_at", "TEXT"],
    ["seo_json", "TEXT"],
    ["tags_json", "TEXT"],
    ["related_players_json", "TEXT"],
    ["related_tournament", "TEXT"],
    ["featured_image_prompt", "TEXT"],
    ["facts_used_json", "TEXT"],
    ["missing_data_json", "TEXT"],
    ["quality_score", "REAL"],
  ];
  for (const [column, type] of columns) {
    if (!(await columnExists(db, "seo_articles", column))) {
      await db.prepare(`ALTER TABLE seo_articles ADD COLUMN ${column} ${type}`).run();
    }
  }

  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS idx_seo_articles_created ON seo_articles(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_seo_articles_status ON seo_articles(status, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_seo_articles_published_at ON seo_articles(status, published_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_seo_articles_content_type ON seo_articles(content_type, published_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_seo_articles_related_prediction ON seo_articles(related_prediction_id, published_at DESC)"),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS content_automation_runs (
        id TEXT PRIMARY KEY,
        run_date TEXT NOT NULL,
        requested_json TEXT NOT NULL,
        published_json TEXT NOT NULL,
        skipped_json TEXT NOT NULL,
        failed_json TEXT NOT NULL,
        model TEXT,
        errors_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_content_automation_runs_date ON content_automation_runs(run_date DESC)"),
  ]);
}

async function getEspnNews(limit = 12) {
  const response = await fetch(ESPN_TENNIS_RSS, { headers: { accept: "application/rss+xml, application/xml, text/xml" } });
  if (!response.ok) throw new Error(`ESPN RSS returned ${response.status}`);
  const text = await response.text();
  return text
    .split(/<item\b/i)
    .slice(1, limit + 1)
    .map((item) => {
      const title = rssTag(item, "title");
      const summary = rssTag(item, "description");
      const url = rssTag(item, "link") || rssTag(item, "guid") || "";
      const published = new Date(rssTag(item, "pubDate"));
      return title ? {
        contentType: "news_reaction",
        sourceType: "espn-news",
        sourceId: `news_reaction:${slugify(url || title)}`,
        title,
        summary: summary || "data unavailable",
        url,
        publishedAt: Number.isNaN(published.getTime()) ? "data unavailable" : published.toISOString(),
        facts: [`Source headline: ${title}`, `Source summary: ${summary || "data unavailable"}`, `Published: ${Number.isNaN(published.getTime()) ? "data unavailable" : published.toISOString()}`],
      } : null;
    })
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((candidate) => candidate.sourceId === item.sourceId) === index);
}

async function getMatchCandidates(db, limit = 10) {
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
      AND COALESCE(m.player_a_name, '') NOT LIKE '%/%'
      AND COALESCE(m.player_b_name, '') NOT LIKE '%/%'
    ORDER BY m.live DESC, datetime(COALESCE(m.start_time, p.created_at)) ASC
    LIMIT ?
  `).bind(limit).all();

  return (result.results || []).map((match) => ({
    contentType: "match_prediction",
    sourceType: "match_prediction",
    sourceId: `match_prediction:${match.prediction_id}:${new Date().toISOString().slice(0, 10)}`,
    title: `${match.player_a_name} vs ${match.player_b_name}`,
    url: `${SITE_URL}/predictions/${slugify(`${match.tour} ${match.player_a_name} vs ${match.player_b_name}`)}/`,
    relatedPredictionId: match.prediction_id,
    relatedPlayers: [match.player_a_name, match.player_b_name].filter(Boolean),
    relatedTournament: match.tournament || null,
    facts: [
      `Tour: ${match.tour || "data unavailable"}`,
      `Tournament: ${match.tournament || "data unavailable"}`,
      `Surface: ${match.surface || "data unavailable"}`,
      `Start time: ${match.start_time || "data unavailable"}`,
      `Prediction: ${match.predicted_winner_name || "data unavailable"}`,
      `Confidence: ${match.confidence ?? "data unavailable"}`,
      `Odds: ${match.predicted_odds || "data unavailable"}`,
    ],
    match,
  }));
}

async function getPlayerCandidates(db, limit = 10) {
  const result = await db.prepare(`
    SELECT
      p.name,
      p.tour,
      p.country,
      p.current_rank,
      p.points,
      p.updated_at,
      COUNT(prm.id) AS recent_matches,
      SUM(CASE WHEN prm.result = 'win' THEN 1 ELSE 0 END) AS recent_wins,
      SUM(CASE WHEN prm.result = 'loss' THEN 1 ELSE 0 END) AS recent_losses
    FROM players p
    LEFT JOIN player_recent_matches prm ON prm.player_id = p.id
      AND date(prm.match_date) >= date('now', '-100 days')
    WHERE p.tour IN ('ATP', 'WTA') AND p.current_rank IS NOT NULL
    GROUP BY p.id
    ORDER BY p.current_rank ASC
    LIMIT ?
  `).bind(limit).all();
  return (result.results || []).map((player) => ({
    contentType: "player_analysis",
    sourceType: "player_analysis",
    sourceId: `player_analysis:${player.tour}:${slugify(player.name)}:${new Date().toISOString().slice(0, 10)}`,
    title: `${player.name} player analysis`,
    url: `${SITE_URL}/players/${String(player.tour).toLowerCase()}/${slugify(player.name)}/`,
    relatedPlayers: [player.name],
    relatedTournament: null,
    facts: [
      `Player: ${player.name || "data unavailable"}`,
      `Tour: ${player.tour || "data unavailable"}`,
      `Country: ${player.country || "data unavailable"}`,
      `Current rank: ${player.current_rank ?? "data unavailable"}`,
      `Ranking points: ${player.points ?? "data unavailable"}`,
      `Recent 100-day matches: ${player.recent_matches ?? "data unavailable"}`,
      `Recent 100-day wins: ${player.recent_wins ?? "data unavailable"}`,
      `Recent 100-day losses: ${player.recent_losses ?? "data unavailable"}`,
      `Recent 100-day win rate: ${player.recent_matches ? Math.round((Number(player.recent_wins || 0) / Number(player.recent_matches)) * 1000) / 10 : "data unavailable"}`,
    ],
    player,
  }));
}

async function getTournamentCandidates(db, limit = 10) {
  const result = await db.prepare(`
    SELECT tournament, GROUP_CONCAT(DISTINCT tour) AS tours, MIN(start_time) AS starts_at,
      MAX(start_time) AS latest_match_at, GROUP_CONCAT(DISTINCT surface) AS surfaces,
      COUNT(*) AS match_count
    FROM matches
    WHERE tournament IS NOT NULL AND tournament <> '' AND tour IN ('ATP', 'WTA')
    GROUP BY tournament
    ORDER BY datetime(COALESCE(MIN(start_time), MAX(updated_at))) DESC
    LIMIT ?
  `).bind(limit).all();
  return (result.results || []).map((tournament) => ({
    contentType: "tournament_preview",
    sourceType: "tournament_preview",
    sourceId: `tournament_preview:${slugify(tournament.tournament)}:${new Date().toISOString().slice(0, 10)}`,
    title: `${tournament.tournament} tournament preview`,
    url: `${SITE_URL}/tournaments/${slugify(tournament.tournament)}/`,
    relatedPlayers: [],
    relatedTournament: tournament.tournament,
    facts: [
      `Tournament: ${tournament.tournament || "data unavailable"}`,
      `Tours: ${tournament.tours || "data unavailable"}`,
      `Start date: ${tournament.starts_at || "data unavailable"}`,
      `Latest stored match date: ${tournament.latest_match_at || "data unavailable"}`,
      `Surfaces: ${tournament.surfaces || "data unavailable"}`,
      `Stored match count: ${tournament.match_count ?? "data unavailable"}`,
    ],
    tournament,
  }));
}

function getEvergreenCandidates(limit = 5) {
  const topics = [
    "How to read AI tennis predictions responsibly",
    "ATP vs WTA tennis betting research checklist",
    "How surface data changes tennis predictions",
    "Crypto tennis betting guide for beginners",
    "How to compare player form before a tennis match",
  ];
  return topics.slice(0, limit).map((topic) => ({
    contentType: "evergreen_article",
    sourceType: "evergreen_article",
    sourceId: `evergreen_article:${slugify(topic)}`,
    title: topic,
    url: `${SITE_URL}/tennis-predictions/`,
    relatedPlayers: [],
    relatedTournament: null,
    facts: [
      `Topic: ${topic}`,
      "Use general education only where specific live data is unavailable.",
      "Do not guarantee betting outcomes.",
    ],
  }));
}

function normalizeTitle(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleSimilarity(a, b) {
  const left = new Set(normalizeTitle(a).split(" ").filter((word) => word.length > 2));
  const right = new Set(normalizeTitle(b).split(" ").filter((word) => word.length > 2));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((word) => right.has(word)).length;
  return intersection / Math.max(left.size, right.size);
}

async function existingRecentArticles(db) {
  const result = await db.prepare(`
    SELECT slug, title, related_prediction_id, published_at, created_at
    FROM seo_articles
    WHERE status = 'published' AND datetime(COALESCE(published_at, created_at)) >= datetime('now', '-30 days')
    ORDER BY datetime(COALESCE(published_at, created_at)) DESC
    LIMIT 500
  `).all();
  return result.results || [];
}

async function duplicateReason(db, candidate, output, recent) {
  const slug = slugify(output.slug || output.title);
  const bySlug = await db.prepare("SELECT id FROM seo_articles WHERE slug = ? LIMIT 1").bind(slug).first();
  if (bySlug) return `duplicate slug: ${slug}`;
  const bySource = await db.prepare("SELECT id FROM seo_articles WHERE source_id = ? LIMIT 1").bind(candidate.sourceId).first();
  if (bySource) return `duplicate source: ${candidate.sourceId}`;
  if (candidate.relatedPredictionId) {
    const sameMatch = await db.prepare(`
      SELECT id FROM seo_articles
      WHERE related_prediction_id = ?
        AND status = 'published'
        AND date(COALESCE(published_at, created_at)) = date('now')
      LIMIT 1
    `).bind(candidate.relatedPredictionId).first();
    if (sameMatch) return "same match already published today";
  }
  const nearDuplicate = recent.find((article) => titleSimilarity(article.title, output.title) >= 0.72);
  return nearDuplicate ? `near-duplicate title from last 30 days: ${nearDuplicate.title}` : null;
}

function sanitizeBody(value = "") {
  const body = String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/<\/?(?!p\b|h2\b|h3\b|ul\b|li\b|strong\b|em\b|a\b)[^>]+>/gi, "")
    .trim();
  return body || "<p>data unavailable</p>";
}

function normalizeOutput(raw, candidate) {
  const output = {
    content_type: raw.content_type,
    title: String(raw.title || "").trim(),
    slug: slugify(raw.slug || raw.title || candidate.title),
    summary: String(raw.summary || "").trim(),
    body: sanitizeBody(raw.body),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 12) : [],
    related_players: Array.isArray(raw.related_players) ? raw.related_players.map(String).slice(0, 8) : candidate.relatedPlayers || [],
    related_tournament: raw.related_tournament === null ? null : String(raw.related_tournament || candidate.relatedTournament || "").trim() || null,
    featured_image_prompt: String(raw.featured_image_prompt || "").trim(),
    seo: raw.seo && typeof raw.seo === "object" ? raw.seo : {},
    facts_used: Array.isArray(raw.facts_used) ? raw.facts_used.map(String).slice(0, 20) : [],
    missing_data: Array.isArray(raw.missing_data) ? raw.missing_data.map(String).slice(0, 20) : [],
    quality_score: Number(raw.quality_score),
  };
  output.seo = {
    meta_title: String(output.seo.meta_title || output.title).trim(),
    meta_description: String(output.seo.meta_description || output.summary).trim(),
    canonical_url: `${SITE_URL}/articles/${output.slug}/`,
    og_title: String(output.seo.og_title || output.title).trim(),
    og_description: String(output.seo.og_description || output.summary).trim(),
  };
  return output;
}

function validateOutput(output, candidate) {
  const errors = [];
  const bodyWords = wordCount(output.body);
  const minWords = SEO_MIN_WORDS[output.content_type] || 700;
  const allText = `${output.title} ${output.summary} ${plainText(output.body)}`;
  if (!VALID_CONTENT_TYPES.has(output.content_type)) errors.push("invalid content_type");
  if (output.content_type !== candidate.contentType) errors.push(`content_type mismatch: expected ${candidate.contentType}`);
  if (!output.title || output.title.length < 18) errors.push("title missing or too short");
  if (!output.slug) errors.push("slug missing");
  if (!output.summary || output.summary.length < 60) errors.push("summary missing or too short");
  if (!output.body || bodyWords < minWords) errors.push(`body below SEO word gate: ${bodyWords}/${minWords}`);
  if (!/<h2\b/i.test(output.body)) errors.push("body missing h2 sections");
  if ((output.body.match(/<h2\b/gi) || []).length < 2) errors.push("body needs at least two h2 sections");
  if (!output.seo.meta_title || output.seo.meta_title.length < SEO_MIN_META_TITLE || output.seo.meta_title.length > SEO_MAX_META_TITLE) {
    errors.push(`meta_title must be ${SEO_MIN_META_TITLE}-${SEO_MAX_META_TITLE} characters`);
  }
  if (!output.seo.meta_description || output.seo.meta_description.length < SEO_MIN_META_DESCRIPTION || output.seo.meta_description.length > SEO_MAX_META_DESCRIPTION) {
    errors.push(`meta_description must be ${SEO_MIN_META_DESCRIPTION}-${SEO_MAX_META_DESCRIPTION} characters`);
  }
  if (output.seo.canonical_url !== `${SITE_URL}/articles/${output.slug}/`) errors.push("canonical_url mismatch");
  if (!output.seo.og_title || output.seo.og_title.length > 70) errors.push("og_title missing or too long");
  if (!output.seo.og_description || output.seo.og_description.length < 80 || output.seo.og_description.length > 180) errors.push("og_description missing or invalid length");
  if (!Number.isFinite(output.quality_score) || output.quality_score < 78) errors.push("quality_score below 78");
  if (/guaranteed|sure win|risk[- ]?free|lock\b/i.test(allText)) errors.push("prohibited betting guarantee language");
  if (!includesText(allText, "TennisTipz")) errors.push("missing TennisTipz brand mention");
  for (const player of candidate.relatedPlayers || []) {
    if (player && !includesText(allText, player)) errors.push(`missing related player mention: ${player}`);
  }
  if (candidate.relatedTournament && !includesText(allText, candidate.relatedTournament)) errors.push(`missing related tournament mention: ${candidate.relatedTournament}`);
  if (!/\/tennis-predictions\/|prediction board|player stats|tennis news|tournament/i.test(allText)) {
    errors.push("missing internal-link context terms");
  }
  if (output.content_type === "match_prediction" && !output.body.includes("This content is for informational and entertainment purposes only. It is not financial or betting advice.")) {
    errors.push("missing prediction disclaimer");
  }
  if (!output.facts_used.length) errors.push("facts_used missing");
  return errors;
}

function responseJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["content_type", "title", "slug", "summary", "body", "tags", "related_players", "related_tournament", "featured_image_prompt", "seo", "facts_used", "missing_data", "quality_score"],
    properties: {
      content_type: { type: "string", enum: [...VALID_CONTENT_TYPES] },
      title: { type: "string" },
      slug: { type: "string" },
      summary: { type: "string" },
      body: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      related_players: { type: "array", items: { type: "string" } },
      related_tournament: { anyOf: [{ type: "string" }, { type: "null" }] },
      featured_image_prompt: { type: "string" },
      seo: {
        type: "object",
        additionalProperties: false,
        required: ["meta_title", "meta_description", "canonical_url", "og_title", "og_description"],
        properties: {
          meta_title: { type: "string" },
          meta_description: { type: "string" },
          canonical_url: { type: "string" },
          og_title: { type: "string" },
          og_description: { type: "string" },
        },
      },
      facts_used: { type: "array", items: { type: "string" } },
      missing_data: { type: "array", items: { type: "string" } },
      quality_score: { type: "number" },
    },
  };
}

function buildPrompt(candidate) {
  const minWords = SEO_MIN_WORDS[candidate.contentType] || 700;
  return {
    site: "TennisTipz.win",
    required_content_type: candidate.contentType,
    source_title: candidate.title,
    source_url: candidate.url,
    facts_available: candidate.facts,
    related_players: candidate.relatedPlayers || [],
    related_tournament: candidate.relatedTournament || null,
    seo_quality_gates: {
      body_min_words: minWords,
      meta_title: `${SEO_MIN_META_TITLE}-${SEO_MAX_META_TITLE} characters, primary keyword near the beginning, TennisTipz brand only if it fits naturally`,
      meta_description: `${SEO_MIN_META_DESCRIPTION}-${SEO_MAX_META_DESCRIPTION} characters, unique, natural, click-worthy, no guarantees`,
      structure: "Use at least two useful h2 sections, short paragraphs, and specific context from facts_available.",
      internal_context: "Mention relevant TennisTipz hubs naturally: tennis predictions, player stats, tennis news, tournament pages, or the prediction board.",
      schema_readiness: "Write clean Article-friendly content with factual headline, summary, dates handled by the app, and no fake quotes.",
    },
    rules: [
      "Return strict JSON only.",
      "Use only the facts_available list for statistics.",
      "If a fact is missing, write data unavailable.",
      "Do not create fake quotes.",
      "Do not guarantee betting outcomes.",
      "Mention related player names and related tournament exactly when provided.",
      "Use natural internal-link context terms; the renderer will add links automatically, so do not output markdown.",
      "The body must be HTML using only p, h2, h3, ul, li, strong, em tags.",
      `The body must be at least ${minWords} words and must be useful on its own.`,
      `seo.meta_title must be ${SEO_MIN_META_TITLE}-${SEO_MAX_META_TITLE} characters.`,
      `seo.meta_description must be ${SEO_MIN_META_DESCRIPTION}-${SEO_MAX_META_DESCRIPTION} characters.`,
      "seo.og_title must be concise and no longer than 70 characters.",
      "seo.og_description must be 80-180 characters.",
      "Use TennisTipz branding naturally in the content.",
      "For match_prediction, include this exact sentence: This content is for informational and entertainment purposes only. It is not financial or betting advice.",
    ],
  };
}

function readOpenAiText(data) {
  return data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text).filter(Boolean).join("\n") || "";
}

async function callOpenAi(env, candidate, attempt = 1) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const model = env.OPENAI_MODEL || DEFAULT_MODEL;
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "You are the TennisTipz.win automated editor. Produce original, useful, SEO-friendly tennis pages. Do not invent statistics, quotes, or betting certainty. Missing data must be explicitly labelled data unavailable.",
        },
        { role: "user", content: JSON.stringify(buildPrompt(candidate)) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "tennistipz_generated_page",
          strict: true,
          schema: responseJsonSchema(),
        },
      },
      max_output_tokens: 6200,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${JSON.stringify(data).slice(0, 400)}`);
  try {
    return { output: normalizeOutput(JSON.parse(readOpenAiText(data)), candidate), model, attempt };
  } catch (error) {
    if (attempt < 2) return callOpenAi(env, candidate, attempt + 1);
    throw new Error(`OpenAI returned invalid JSON: ${error.message}`);
  }
}

async function publishArticle(db, candidate, output) {
  const id = crypto.randomUUID();
  const publishedAt = new Date().toISOString();
  await db.prepare(`
    INSERT INTO seo_articles (
      id, slug, title, description, excerpt, body_html, source_type, source_id,
      source_url, source_title, related_prediction_id, keywords_json, status,
      content_type, published_at, seo_json, tags_json, related_players_json,
      related_tournament, featured_image_prompt, facts_used_json, missing_data_json,
      quality_score, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id,
    output.slug,
    output.title,
    output.seo.meta_description || output.summary,
    output.summary,
    output.body,
    candidate.sourceType,
    candidate.sourceId,
    candidate.url || null,
    candidate.title || null,
    candidate.relatedPredictionId || null,
    toJson(output.tags),
    output.content_type,
    publishedAt,
    JSON.stringify(output.seo),
    toJson(output.tags),
    toJson(output.related_players),
    output.related_tournament,
    output.featured_image_prompt,
    toJson(output.facts_used),
    toJson(output.missing_data),
    output.quality_score
  ).run();
  return { id, slug: output.slug, title: output.title, content_type: output.content_type, url: `${SITE_URL}/articles/${output.slug}/`, published_at: publishedAt };
}

async function candidatesForType(db, contentType, count) {
  if (count <= 0) return [];
  if (contentType === "match_prediction") return getMatchCandidates(db, Math.max(count * 4, 8));
  if (contentType === "player_analysis") return getPlayerCandidates(db, Math.max(count * 4, 8));
  if (contentType === "tournament_preview") return getTournamentCandidates(db, Math.max(count * 4, 8));
  if (contentType === "news_reaction") return getEspnNews(Math.max(count * 4, 8)).catch(() => []);
  if (contentType === "evergreen_article") return getEvergreenCandidates(Math.max(count * 4, 8));
  return [];
}

async function logRun(db, log) {
  await db.prepare(`
    INSERT INTO content_automation_runs (id, run_date, requested_json, published_json, skipped_json, failed_json, model, errors_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    log.runDate,
    JSON.stringify(log.requested),
    JSON.stringify(log.published),
    JSON.stringify(log.skipped),
    JSON.stringify(log.failed),
    log.model,
    JSON.stringify(log.errors)
  ).run();
}

async function runAutopublish(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  if (!isAuthorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  if (!isEnabled(env, url)) return jsonResponse({ ok: true, enabled: false, skipped: "CONTENT_AUTOPUBLISH_ENABLED is not true" });

  const db = env.TENNIS_DB;
  await ensureAutomationTables(db);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  const requested = getCounts(env, url);
  const recent = await existingRecentArticles(db);
  const log = {
    runDate: new Date().toISOString(),
    requested,
    published: [],
    skipped: [],
    failed: [],
    model: env.OPENAI_MODEL || DEFAULT_MODEL,
    errors: [],
  };

  for (const [contentType, count] of Object.entries(requested)) {
    let publishedForType = 0;
    const candidates = await candidatesForType(db, contentType, count);
    for (const candidate of candidates) {
      if (publishedForType >= count) break;
      try {
        const generation = await callOpenAi(env, candidate);
        const validationErrors = validateOutput(generation.output, candidate);
        if (validationErrors.length) {
          log.failed.push({ content_type: contentType, source_id: candidate.sourceId, reason: validationErrors.join("; ") });
          continue;
        }
        const duplicate = await duplicateReason(db, candidate, generation.output, recent);
        if (duplicate) {
          log.skipped.push({ content_type: contentType, source_id: candidate.sourceId, reason: duplicate });
          continue;
        }
        if (dryRun) {
          log.published.push({ dryRun: true, content_type: contentType, title: generation.output.title, slug: generation.output.slug });
        } else {
          const saved = await publishArticle(db, candidate, generation.output);
          log.published.push(saved);
          recent.unshift({ slug: saved.slug, title: saved.title, related_prediction_id: candidate.relatedPredictionId || null, published_at: saved.published_at });
        }
        publishedForType += 1;
      } catch (error) {
        log.failed.push({ content_type: contentType, source_id: candidate.sourceId, reason: error.message });
      }
    }
    if (!candidates.length && count > 0) log.skipped.push({ content_type: contentType, reason: "no source candidates available" });
  }

  if (!dryRun) {
    try {
      await logRun(db, log);
    } catch (error) {
      log.errors.push(`failed to log run: ${error.message}`);
    }
  }

  return jsonResponse({
    ok: true,
    enabled: true,
    dryRun,
    runDate: log.runDate,
    model: log.model,
    requested: log.requested,
    published: log.published,
    skippedDuplicates: log.skipped,
    failedGenerations: log.failed,
    errors: log.errors,
    dynamicSitemap: `${SITE_URL}/dynamic-sitemap.xml`,
  });
}

export async function onRequestPost({ request, env }) {
  return runAutopublish(request, env);
}

export async function onRequestGet({ request, env }) {
  return runAutopublish(request, env);
}
