const SITE_URL = "https://www.tennistipz.win";
const CANONICAL_HOST = "www.tennistipz.win";
const CLOUDBET_URL = "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Wimbledon&aftm_cid=4";
const MIN_FEATURED_ODDS = 1.4;
const MAX_FEATURED_ODDS = 2.0;
const MIN_CONFIDENCE = 70;

const PAGE_CONFIG = {
  today: {
    path: "/wimbledon-predictions-today/",
    title: "Wimbledon Predictions Today: ATP & WTA Picks, Schedule and Odds | TennisTipz",
    h1: "Wimbledon Predictions Today",
    eyebrow: "Daily Wimbledon hub",
    description: "Wimbledon predictions today with ATP and WTA schedule, grass-court picks, Cloudbet-linked odds, results, player links and responsible tennis betting research.",
    intro: "This page is the daily Wimbledon command center: current ATP and WTA singles matches, featured picks above 1.40 odds, grass-court context, results, and links into every relevant prediction page.",
    focus: "today",
    tour: null,
  },
  dayPreview: {
    path: "/wimbledon-day-3-betting-preview/",
    title: "Wimbledon Day 3 Betting Preview, Matches and Tennis Predictions | TennisTipz",
    h1: "Wimbledon Day 3 Betting Preview",
    eyebrow: "Wimbledon daily analysis",
    description: "Wimbledon Day 3 betting preview with match schedule, grass-court risk notes, ATP and WTA prediction links, results and responsible odds research.",
    intro: "Use this daily preview to scan the Wimbledon card before the markets move. The focus is not blind tipping; it is identifying which matches deserve deeper research and which short prices are better skipped.",
    focus: "day-preview",
    tour: null,
  },
  underdogs: {
    path: "/best-wimbledon-underdog-picks/",
    title: "Best Wimbledon Underdog Picks and Value Angles | TennisTipz",
    h1: "Best Wimbledon Underdog Picks",
    eyebrow: "Wimbledon value watch",
    description: "Best Wimbledon underdog picks and value angles using listed odds, confidence, ranking context, grass-court risk and responsible betting research.",
    intro: "Underdogs at Wimbledon need extra discipline because grass can create short-point variance, but not every big price is value. This page highlights higher-price Wimbledon picks when the model confidence and market range still pass public filters.",
    focus: "underdogs",
    tour: null,
  },
  atp: {
    path: "/atp-wimbledon-predictions/",
    title: "ATP Wimbledon Predictions, Schedule, Picks and Odds | TennisTipz",
    h1: "ATP Wimbledon Predictions",
    eyebrow: "Men's Wimbledon hub",
    description: "ATP Wimbledon predictions with men's singles schedule, grass-court picks, Cloudbet-linked odds, player pages, results and responsible betting research.",
    intro: "ATP Wimbledon matches can move quickly around serve pressure, tie-break risk and first-strike tennis. This page filters the men's singles feed into current schedule rows, featured picks and internal player research.",
    focus: "tour",
    tour: "ATP",
  },
  wta: {
    path: "/wta-wimbledon-predictions/",
    title: "WTA Wimbledon Predictions, Schedule, Picks and Odds | TennisTipz",
    h1: "WTA Wimbledon Predictions",
    eyebrow: "Women's Wimbledon hub",
    description: "WTA Wimbledon predictions with women's singles schedule, grass-court picks, Cloudbet-linked odds, player pages, results and responsible betting research.",
    intro: "WTA Wimbledon markets can shift fast around return games, momentum and late news. This page keeps women's singles predictions, schedule links and player pages together for calmer research.",
    focus: "tour",
    tour: "WTA",
  },
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "wimbledon";
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(value) {
  if (!value) return "Time TBC";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 16);
  return parsed.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function formatDateOnly(value) {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function playerUrl(tour, name) {
  return `/players/${String(tour || "atp").toLowerCase()}/${slugify(name)}/`;
}

function predictionUrl(match) {
  return `/predictions/${slugify(`${match.tour} ${match.player_a_name} vs ${match.player_b_name}`)}/`;
}

function canonicalRedirect(request, canonicalPath) {
  const url = new URL(request.url);
  if (url.hostname === CANONICAL_HOST && url.protocol === "https:" && url.pathname === canonicalPath) return null;
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.pathname = canonicalPath;
  url.search = "";
  return Response.redirect(url.toString(), 301);
}

function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

async function getWimbledonMatches(db, config) {
  const tourFilter = config.tour ? "AND m.tour = ?" : "";
  const params = config.tour ? [config.tour] : [];
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
      m.score,
      m.winner_name,
      pa.current_rank AS player_a_rank,
      pb.current_rank AS player_b_rank,
      p.id AS prediction_id,
      p.predicted_winner_name,
      p.confidence,
      p.predicted_odds,
      p.model_edge,
      p.created_at AS prediction_created_at
    FROM matches m
    LEFT JOIN predictions p ON p.match_id = m.id
    LEFT JOIN players pa ON pa.tour = m.tour AND pa.normalized_name = m.normalized_player_a
    LEFT JOIN players pb ON pb.tour = m.tour AND pb.normalized_name = m.normalized_player_b
    WHERE LOWER(COALESCE(m.tournament, '')) LIKE '%wimbledon%'
      AND m.tour IN ('ATP', 'WTA')
      ${tourFilter}
      AND COALESCE(m.player_a_name, '') NOT LIKE '%/%'
      AND COALESCE(m.player_b_name, '') NOT LIKE '%/%'
    ORDER BY
      m.live DESC,
      CASE WHEN datetime(COALESCE(m.start_time, p.created_at, m.updated_at)) >= datetime('now', '-3 hours') THEN 0 ELSE 1 END ASC,
      CASE WHEN datetime(COALESCE(m.start_time, p.created_at, m.updated_at)) >= datetime('now', '-3 hours') THEN datetime(COALESCE(m.start_time, p.created_at, m.updated_at)) END ASC,
      datetime(COALESCE(m.start_time, p.created_at, m.updated_at)) DESC
    LIMIT 260
  `).bind(...params).all();
  return result.results || [];
}

async function getWimbledonArticles(db) {
  try {
    const result = await db.prepare(`
      SELECT slug, title, description, excerpt, source_type, created_at, updated_at
      FROM seo_articles
      WHERE status = 'published'
        AND (LOWER(title) LIKE '%wimbledon%' OR LOWER(description) LIKE '%wimbledon%' OR LOWER(excerpt) LIKE '%wimbledon%' OR LOWER(body_html) LIKE '%wimbledon%')
      ORDER BY datetime(COALESCE(updated_at, created_at)) DESC
      LIMIT 8
    `).all();
    return result.results || [];
  } catch {
    return [];
  }
}

function isUpcoming(match) {
  const start = Date.parse(match.start_time || "");
  return match.live || !start || start >= Date.now() - 3 * 60 * 60 * 1000;
}

function isResult(match) {
  return Boolean(match.winner_name) || /finished|complete|ended|final/i.test(String(match.status || ""));
}

function featuredPicks(matches, config) {
  const picks = matches
    .filter((match) => match.prediction_id)
    .filter((match) => isUpcoming(match) && !isResult(match))
    .filter((match) => asNumber(match.predicted_odds) >= MIN_FEATURED_ODDS && asNumber(match.predicted_odds) <= MAX_FEATURED_ODDS)
    .filter((match) => asNumber(match.confidence) >= MIN_CONFIDENCE);
  const shaped = config.focus === "underdogs"
    ? picks.filter((match) => asNumber(match.predicted_odds) >= 1.6)
    : picks;
  return shaped
    .sort((a, b) => Number(Boolean(b.live)) - Number(Boolean(a.live)) || asNumber(b.confidence) - asNumber(a.confidence) || asNumber(b.predicted_odds) - asNumber(a.predicted_odds))
    .slice(0, 16);
}

function renderPickCard(match) {
  return `<article class="card">
    <p class="pill">${escapeHtml(match.tour)} · ${escapeHtml(match.live ? "Live" : "Upcoming")}</p>
    <h3><a href="${predictionUrl(match)}">${escapeHtml(match.player_a_name)} vs ${escapeHtml(match.player_b_name)}</a></h3>
    <p class="muted">${escapeHtml(formatDate(match.start_time))} · ${escapeHtml(match.surface || "Grass")}</p>
    <p><strong>Pick:</strong> ${escapeHtml(match.predicted_winner_name || "Pending")} · <strong>Odds:</strong> ${escapeHtml(match.predicted_odds || "N/A")} · <strong>Confidence:</strong> ${escapeHtml(match.confidence ? `${match.confidence}%` : "Pending")}</p>
    <p class="muted">Ranks: ${escapeHtml(match.player_a_name)} ${escapeHtml(match.player_a_rank ? `#${match.player_a_rank}` : "rank TBC")} · ${escapeHtml(match.player_b_name)} ${escapeHtml(match.player_b_rank ? `#${match.player_b_rank}` : "rank TBC")}</p>
  </article>`;
}

function renderSchedule(matches) {
  const rows = matches.filter(isUpcoming).slice(0, 28);
  if (!rows.length) return `<p class="muted">No upcoming Wimbledon schedule rows are stored yet. The DB sync will refresh this page when ATP/WTA markets are available.</p>`;
  return `<div class="list">${rows.map((match) => `<article class="row">
    <div><strong><a href="${playerUrl(match.tour, match.player_a_name)}">${escapeHtml(match.player_a_name)}</a> vs <a href="${playerUrl(match.tour, match.player_b_name)}">${escapeHtml(match.player_b_name)}</a></strong><p class="muted">${escapeHtml(match.tour)} · ${escapeHtml(formatDate(match.start_time))} · ${escapeHtml(match.surface || "Grass")}</p></div>
    <div><span class="pill">${escapeHtml(match.live ? "Live" : match.status || "Scheduled")}</span>${match.prediction_id ? `<p><a href="${predictionUrl(match)}">prediction</a></p>` : ""}</div>
  </article>`).join("")}</div>`;
}

function renderResults(matches) {
  const rows = matches.filter(isResult).slice(0, 16);
  if (!rows.length) return `<p class="muted">No completed Wimbledon results are stored for this page yet.</p>`;
  return `<div class="list">${rows.map((match) => `<article class="row">
    <div><strong><a href="${playerUrl(match.tour, match.player_a_name)}">${escapeHtml(match.player_a_name)}</a> vs <a href="${playerUrl(match.tour, match.player_b_name)}">${escapeHtml(match.player_b_name)}</a></strong><p class="muted">${escapeHtml(match.tour)} · ${escapeHtml(formatDate(match.start_time))}</p></div>
    <div><span class="pill">${escapeHtml(match.winner_name ? `Winner: ${match.winner_name}` : match.status || "Result")}</span>${match.score ? `<p class="muted">${escapeHtml(match.score)}</p>` : ""}</div>
  </article>`).join("")}</div>`;
}

function renderNews(articles) {
  if (!articles.length) return `<p class="muted">No Wimbledon article is stored yet. Related news and TennisTipz analysis will appear when the article pipeline publishes new Wimbledon stories.</p>`;
  return `<div class="grid">${articles.map((article) => `<article class="card">
    <p class="pill">${escapeHtml(article.source_type || "Article")}</p>
    <h3><a href="/articles/${escapeHtml(article.slug)}/">${escapeHtml(article.title)}</a></h3>
    <p class="muted">${escapeHtml(article.excerpt || article.description || "Wimbledon tennis analysis.")}</p>
  </article>`).join("")}</div>`;
}

function renderResearchCopy(config) {
  const underdogCopy = config.focus === "underdogs"
    ? `<p>For underdogs, price is only one input. A bigger number can be attractive, but Wimbledon grass also increases variance. The safer workflow is to demand a clear reason: ranking mismatch that the market overstates, serve protection, current form, or a draw spot where the favorite may be under pressure.</p>`
    : `<p>For daily Wimbledon research, the strongest pages are the ones that connect schedule, odds, confidence, rankings, surface and results. A short favorite below 1.40 can still win, but it is not the main public feature here because the risk-to-return profile is usually less useful for readers.</p>`;
  return `<section class="section copy">
    <h2>How to use this Wimbledon page</h2>
    ${underdogCopy}
    <p>Open the match prediction page, compare both player profiles, check the tournament hub, and recheck the market before acting. TennisTipz content is informational and entertainment content only, not financial or betting advice.</p>
    <div class="links"><a href="/wimbledon/">Wimbledon corner</a><a href="/wimbledon-predictions-today/">Predictions today</a><a href="/atp-wimbledon-predictions/">ATP Wimbledon</a><a href="/wta-wimbledon-predictions/">WTA Wimbledon</a><a href="/tennis-predictions/">All tennis predictions</a></div>
  </section>`;
}

function renderPage(config, matches, articles) {
  const canonical = `${SITE_URL}${config.path}`;
  const picks = featuredPicks(matches, config);
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${canonical}#article`,
    headline: config.h1,
    description: config.description,
    image: `${SITE_URL}/og-image.png`,
    datePublished: "2026-07-01",
    dateModified: new Date().toISOString(),
    author: { "@type": "Organization", name: "TennisTipz" },
    publisher: { "@type": "Organization", name: "TennisTipz" },
    mainEntityOfPage: canonical,
    isAccessibleForFree: true,
  };
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${canonical}#featured-picks`,
    name: `${config.h1} featured picks`,
    itemListElement: picks.slice(0, 10).map((match, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}${predictionUrl(match)}`,
      name: `${match.player_a_name} vs ${match.player_b_name} Prediction`,
    })),
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "TennisTipz", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Wimbledon", item: `${SITE_URL}/wimbledon/` },
      { "@type": "ListItem", position: 3, name: config.h1, item: canonical },
    ],
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(config.title)}</title>
<meta name="description" content="${escapeHtml(config.description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="TennisTipz">
<meta property="og:title" content="${escapeHtml(config.title)}">
<meta property="og:description" content="${escapeHtml(config.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${SITE_URL}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(config.title)}">
<meta name="twitter:description" content="${escapeHtml(config.description)}">
<meta name="twitter:image" content="${SITE_URL}/og-image.png">
<script type="application/ld+json">${jsonLd(articleSchema)}</script>
${picks.length ? `<script type="application/ld+json">${jsonLd(itemListSchema)}</script>` : ""}
<script type="application/ld+json">${jsonLd(breadcrumbSchema)}</script>
<style>body{margin:0;background:#07111f;color:#e5edf7;font-family:Arial,sans-serif;line-height:1.65}.wrap{max-width:1120px;margin:auto;padding:32px 18px}.hero{border:1px solid rgba(190,242,100,.25);background:linear-gradient(135deg,rgba(22,101,52,.28),rgba(15,23,42,.88));padding:28px}.muted,.crumb{color:#94a3b8}a{color:#bef264}.pill{display:inline-block;background:#bef264;color:#08111f;font-weight:800;padding:6px 10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.card,.row{background:#111c2d;border:1px solid rgba(255,255,255,.1);padding:18px}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;margin-top:10px}.section{margin-top:34px}.copy{font-size:17px}.links{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.links a,.cta{background:#bef264;color:#08111f;font-weight:900;text-decoration:none;padding:10px 12px}.sponsor{border:1px solid rgba(190,242,100,.18);background:rgba(190,242,100,.05);padding:18px;margin-top:20px}h1{font-size:clamp(34px,6vw,62px);line-height:1.05;margin:10px 0}h2{margin-top:0}@media(max-width:760px){.row{grid-template-columns:1fr}}</style>
</head><body><main class="wrap">
<p class="crumb"><a href="/">TennisTipz</a> / <a href="/wimbledon/">Wimbledon</a> / ${escapeHtml(config.h1)}</p>
<section class="hero">
  <span class="pill">${escapeHtml(config.eyebrow)}</span>
  <h1>${escapeHtml(config.h1)}</h1>
  <p class="muted">${escapeHtml(config.intro)}</p>
  <div class="sponsor"><strong>Wimbledon odds research:</strong> compare the prediction page with the live market before making any decision. <a class="cta" href="${CLOUDBET_URL}" rel="sponsored nofollow noreferrer" target="_blank">Open Cloudbet tennis odds</a></div>
</section>
<section class="section">
  <h2>Featured Wimbledon Picks Above 1.40 Odds</h2>
  ${picks.length ? `<div class="grid">${picks.map(renderPickCard).join("")}</div>` : `<p class="muted">No Wimbledon picks above 1.40 odds currently pass the public confidence filter. Short prices may still exist on match pages, but this SEO hub features stronger public risk-to-return spots.</p>`}
</section>
<section class="section">
  <h2>Wimbledon Schedule</h2>
  ${renderSchedule(matches)}
</section>
<section class="section">
  <h2>Wimbledon Results</h2>
  ${renderResults(matches)}
</section>
${renderResearchCopy(config)}
<section class="section">
  <h2>Related Wimbledon News and Articles</h2>
  ${renderNews(articles)}
</section>
<p class="muted section">18+ Bet responsibly. TennisTipz pages are for informational and entertainment purposes only and are not financial or betting advice. Data unavailable fields are left as unavailable rather than invented.</p>
</main></body></html>`;
}

export async function renderWimbledonSeoPage({ request, env, page }) {
  const config = PAGE_CONFIG[page] || PAGE_CONFIG.today;
  const redirect = canonicalRedirect(request, config.path);
  if (redirect) return redirect;
  if (!env.TENNIS_DB) return new Response("Missing database", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  const [matches, articles] = await Promise.all([
    getWimbledonMatches(env.TENNIS_DB, config),
    getWimbledonArticles(env.TENNIS_DB),
  ]);
  return new Response(renderPage(config, matches, articles), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=1800",
    },
  });
}
