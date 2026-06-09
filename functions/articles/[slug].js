import { canonicalTournamentSlug, linkArticleBody, relatedArticleLinks, slugify } from "../lib/internal-links.js";

const SITE_URL = "https://www.tennistipz.win";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function safeBodyHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "");
}

const MIN_INDEXED_PICK_ODDS = 1.01;
const MAX_INDEXED_PICK_ODDS = 2.0;
const MIN_INDEXED_CONFIDENCE = 70;

async function buildInternalLinkContext(db, article) {
  const text = `${article.title || ""} ${article.description || ""} ${article.excerpt || ""} ${article.body_html || ""}`.toLowerCase();
  const [players, tournaments, predictions, articles] = await Promise.all([
    db.prepare(`
      SELECT name, tour
      FROM players
      WHERE tour IN ('ATP', 'WTA') AND current_rank IS NOT NULL
      ORDER BY current_rank ASC
      LIMIT 1000
    `).all().catch(() => ({ results: [] })),
    db.prepare(`
      SELECT tournament, GROUP_CONCAT(DISTINCT tour) AS tours
      FROM matches
      WHERE tournament IS NOT NULL
        AND tournament <> ''
        AND tour IN ('ATP', 'WTA')
        AND (
          tour = 'ATP'
          OR LOWER(tournament) LIKE '%australian open%'
          OR LOWER(tournament) LIKE '%french open%'
          OR LOWER(tournament) LIKE '%roland garros%'
          OR LOWER(tournament) LIKE '%wimbledon%'
          OR LOWER(tournament) LIKE '%us open%'
        )
      GROUP BY tournament
      ORDER BY MAX(datetime(COALESCE(start_time, updated_at))) DESC
      LIMIT 250
    `).all().catch(() => ({ results: [] })),
    db.prepare(`
      SELECT m.tour, m.player_a_name, m.player_b_name
      FROM matches m
      JOIN predictions p ON p.match_id = m.id
      WHERE m.tour IN ('ATP', 'WTA')
        AND CAST(COALESCE(p.predicted_odds, '0') AS REAL) BETWEEN ${MIN_INDEXED_PICK_ODDS} AND ${MAX_INDEXED_PICK_ODDS}
        AND CAST(COALESCE(p.confidence, 0) AS INTEGER) >= ${MIN_INDEXED_CONFIDENCE}
        AND LOWER(COALESCE(m.tournament, '')) NOT LIKE '%doubles%'
        AND COALESCE(m.player_a_name, '') NOT LIKE '%/%'
        AND COALESCE(m.player_b_name, '') NOT LIKE '%/%'
      ORDER BY p.created_at DESC, m.updated_at DESC
      LIMIT 500
    `).all().catch(() => ({ results: [] })),
    db.prepare(`
      SELECT slug, title
      FROM seo_articles
      WHERE status = 'published' AND slug <> ?
      ORDER BY datetime(COALESCE(updated_at, created_at)) DESC
      LIMIT 24
    `).bind(article.slug).all().catch(() => ({ results: [] })),
  ]);

  const candidates = [];
  for (const player of players.results || []) {
    if (text.includes(String(player.name || "").toLowerCase())) {
      candidates.push({ label: player.name, url: `/players/${String(player.tour).toLowerCase()}/${slugify(player.name)}/`, type: "player" });
    }
  }
  for (const tournament of tournaments.results || []) {
    const name = tournament.tournament || "";
    if (text.includes(name.toLowerCase())) {
      candidates.push({ label: name, url: `/tournaments/${canonicalTournamentSlug(name)}/`, type: "tournament" });
    }
  }
  for (const match of predictions.results || []) {
    const label = `${match.player_a_name} vs ${match.player_b_name}`;
    if (text.includes(label.toLowerCase())) {
      candidates.push({ label, url: `/predictions/${slugify(`${match.tour} ${label}`)}/`, type: "prediction" });
    }
  }
  const relatedArticles = relatedArticleLinks(article.slug, articles.results || []);
  for (const related of relatedArticles) {
    if (text.includes(related.label.toLowerCase())) candidates.push(related);
  }
  return { candidates, relatedArticles };
}

function articleHtml(article, linkContext = { candidates: [], relatedArticles: [] }) {
  const canonical = `${SITE_URL}/articles/${article.slug}/`;
  const title = `${article.title} | TennisTipz`;
  const description = article.description || article.excerpt || "TennisTipz article with ATP/WTA tennis news, predictions, player context, and responsible betting research.";
  const image = `${SITE_URL}/og-image.png`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description,
    datePublished: article.created_at,
    dateModified: article.updated_at || article.created_at,
    author: { "@type": "Organization", name: "TennisTipz" },
    publisher: { "@type": "Organization", name: "TennisTipz" },
    mainEntityOfPage: canonical,
    image,
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="TennisTipz">
<meta property="og:title" content="${escapeHtml(article.title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(article.title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${image}">
<link rel="stylesheet" href="/ad-banners.css?v=navy-rails">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<style>body{margin:0;background:#07111f;color:#e5edf7;font-family:Arial,sans-serif;line-height:1.72}.wrap{max-width:920px;margin:auto;padding:32px 18px}.crumb,.muted{color:#94a3b8}a{color:#bef264}.pill{display:inline-block;background:#bef264;color:#08111f;font-weight:700;padding:6px 10px}.article{font-size:18px}.article h2{margin-top:34px;color:#fff}.article h3{margin-top:26px;color:#fff}.article p{margin:18px 0}.source{background:#111c2d;border:1px solid rgba(255,255,255,.1);padding:18px;margin-top:30px}h1{font-size:clamp(34px,6vw,60px);line-height:1.05}</style>
</head><body><main class="wrap">
<p class="crumb"><a href="/">TennisTipz</a> / <a href="/tennis-news/">Tennis news</a></p>
<span class="pill">${escapeHtml(article.source_type === "prediction" ? "Prediction analysis" : "Tennis news analysis")}</span>
<h1>${escapeHtml(article.title)}</h1>
<p class="muted">${escapeHtml(article.excerpt || article.description)}</p>
<article class="article">${linkArticleBody(safeBodyHtml(article.body_html), linkContext.candidates)}</article>
${linkContext.relatedArticles.length ? `<section class="source"><strong>Related TennisTipz articles:</strong><ul>${linkContext.relatedArticles.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.label)}</a></li>`).join("")}</ul></section>` : ""}
${article.source_url ? `<div class="source"><strong>Source context:</strong> <a href="${escapeHtml(article.source_url)}" rel="nofollow noreferrer" target="_blank">${escapeHtml(article.source_title || "Original source")}</a></div>` : ""}
<p class="muted">18+ Bet responsibly. TennisTipz articles are research and opinion, not guaranteed betting outcomes.</p>
<p><a href="/tennis-predictions/">Latest tennis predictions</a> · <a href="/tennis-news/">Tennis news</a> · <a href="/player-stats/">Player stats</a></p>
</main><script src="/ad-banners.js?v=navy-rails" defer></script></body></html>`;
}

export async function onRequestGet({ params, env }) {
  if (!env.TENNIS_DB) return new Response("Missing database", { status: 500 });
  let article = null;
  try {
    article = await env.TENNIS_DB.prepare(`
      SELECT *
      FROM seo_articles
      WHERE slug = ? AND status = 'published'
      LIMIT 1
    `).bind(params.slug).first();
  } catch (error) {
    if (!String(error.message || "").includes("seo_articles")) throw error;
  }
  if (!article) return new Response("Article not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const linkContext = await buildInternalLinkContext(env.TENNIS_DB, article);
  return new Response(articleHtml(article, linkContext), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=1800",
    },
  });
}
