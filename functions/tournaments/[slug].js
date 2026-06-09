const SITE_URL = "https://www.tennistipz.win";
const CANONICAL_HOST = "www.tennistipz.win";
const CLOUDBET_URL = "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Predictions&aftm_cid=4";

const TOURNAMENT_META = {
  "australian-open": { location: "Melbourne, Australia", level: "Grand Slam", surface: "Hard" },
  "french-open": { location: "Paris, France", level: "Grand Slam", surface: "Clay" },
  "roland-garros": { location: "Paris, France", level: "Grand Slam", surface: "Clay" },
  "wimbledon": { location: "London, United Kingdom", level: "Grand Slam", surface: "Grass" },
  "us-open": { location: "New York, United States", level: "Grand Slam", surface: "Hard" },
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
    .replace(/^-+|-+$/g, "") || "tournament";
}

function canonicalTournamentSlug(name = "") {
  const raw = slugify(name);
  if (/roland-garros|french-open|france-open/.test(raw)) return "french-open";
  if (/australian-open|aus-open/.test(raw)) return "australian-open";
  if (/us-open|u-s-open|united-states-open/.test(raw)) return "us-open";
  if (/wimbledon/.test(raw)) return "wimbledon";
  return raw;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(value) {
  if (!value) return "date TBC";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 16);
  return parsed.toISOString().replace("T", " ").slice(0, 16);
}

function formatDateOnly(value) {
  if (!value) return "TBC";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function isoDateOrUndefined(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function playerUrl(tour, name) {
  return `/players/${String(tour || "atp").toLowerCase()}/${slugify(name)}/`;
}

function predictionUrl(match) {
  return `/predictions/${slugify(`${match.tour} ${match.player_a_name} vs ${match.player_b_name}`)}/`;
}

function canonicalRedirect(request) {
  const url = new URL(request.url);
  if (url.hostname === CANONICAL_HOST && url.protocol === "https:") return null;
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  return Response.redirect(url.toString(), 301);
}

function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function mode(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

async function tournamentSummary(db, slug) {
  const result = await db.prepare(`
    SELECT
      tournament,
      COUNT(*) AS match_count,
      MIN(start_time) AS first_start,
      MAX(start_time) AS last_start,
      GROUP_CONCAT(DISTINCT tour) AS tours,
      GROUP_CONCAT(DISTINCT surface) AS surfaces
    FROM matches
    WHERE tournament IS NOT NULL AND tournament <> ''
    GROUP BY tournament
    ORDER BY MAX(datetime(COALESCE(start_time, updated_at))) DESC
    LIMIT 1000
  `).all();
  return (result.results || []).find((row) => canonicalTournamentSlug(row.tournament) === slug || slugify(row.tournament) === slug);
}

async function tournamentMatches(db, tournament) {
  const result = await db.prepare(`
    SELECT
      m.id AS match_id,
      m.tour,
      m.tournament,
      m.start_time,
      m.status,
      m.live,
      m.surface,
      m.player_a_id,
      m.player_b_id,
      m.player_a_name,
      m.player_b_name,
      p.id AS prediction_id,
      p.predicted_winner_name,
      p.confidence,
      p.predicted_odds,
      p.created_at AS prediction_created_at
    FROM matches m
    LEFT JOIN predictions p ON p.match_id = m.id
    WHERE m.tournament = ?
      AND m.tour IN ('ATP', 'WTA')
      AND COALESCE(m.player_a_name, '') NOT LIKE '%/%'
      AND COALESCE(m.player_b_name, '') NOT LIKE '%/%'
    ORDER BY m.live DESC, datetime(COALESCE(m.start_time, p.created_at, m.updated_at)) DESC
    LIMIT 80
  `).bind(tournament).all();
  return result.results || [];
}

async function relatedNews(db, tournament) {
  try {
    const like = `%${String(tournament).toLowerCase()}%`;
    const result = await db.prepare(`
      SELECT slug, title, description, excerpt, source_type, source_title, created_at, updated_at
      FROM seo_articles
      WHERE status = 'published'
        AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(excerpt) LIKE ? OR LOWER(body_html) LIKE ?)
      ORDER BY datetime(COALESCE(updated_at, created_at)) DESC
      LIMIT 8
    `).bind(like, like, like, like).all();
    return result.results || [];
  } catch (error) {
    if (!String(error.message || "").includes("seo_articles")) throw error;
    return [];
  }
}

function tournamentOverview(summary, matches) {
  const meta = TOURNAMENT_META[canonicalTournamentSlug(summary.tournament)] || {};
  const tours = String(summary.tours || "").split(",").filter(Boolean).join(" and ") || "ATP/WTA";
  const surface = meta.surface || mode(String(summary.surfaces || "").split(",")) || "surface TBC";
  const dateText = summary.first_start || summary.last_start ? `${formatDateOnly(summary.first_start)} to ${formatDateOnly(summary.last_start)}` : "dates still syncing";
  const playerCount = new Set(matches.flatMap((match) => [match.player_a_name, match.player_b_name]).filter(Boolean)).size;
  return `${summary.tournament} is tracked on TennisTipz as a ${meta.level || tours} tennis tournament with ${asNumber(summary.match_count)} stored singles matches, ${playerCount} key players in the current database sample, ${surface} surface context, and tournament dates listed as ${dateText}. This hub combines schedule rows, draw-style player links, latest predictions, related news, and betting research links in one indexable page.`;
}

function renderMetric(label, value, helper = "") {
  return `<div class="card"><strong>${escapeHtml(label)}</strong><br><span class="big">${escapeHtml(value)}</span>${helper ? `<p class="muted">${escapeHtml(helper)}</p>` : ""}</div>`;
}

function renderSchedule(matches) {
  if (!matches.length) return `<p class="muted">No schedule rows are stored for this tournament yet. The hub will fill when the daily sync adds ATP/WTA matches.</p>`;
  return `<div class="list-cards">${matches.slice(0, 16).map((match) => `<article class="row">
    <div><strong><a href="${playerUrl(match.tour, match.player_a_name)}">${escapeHtml(match.player_a_name)}</a> vs <a href="${playerUrl(match.tour, match.player_b_name)}">${escapeHtml(match.player_b_name)}</a></strong><p class="muted">${escapeHtml(match.tour)} · ${escapeHtml(formatDate(match.start_time))} UTC · ${escapeHtml(match.surface || "Surface TBC")}</p></div>
    <div><span class="pill">${escapeHtml(match.live ? "Live" : match.status || "Scheduled")}</span>${match.prediction_id ? `<p><a href="${predictionUrl(match)}">prediction page</a></p>` : ""}</div>
  </article>`).join("")}</div>`;
}

function renderPredictions(matches) {
  const predictions = matches.filter((match) => match.prediction_id).slice(0, 10);
  if (!predictions.length) return `<p class="muted">No public prediction pages are attached to this tournament yet. New ATP/WTA betting markets appear when the model and odds filters pass.</p>`;
  return `<div class="grid">${predictions.map((match) => `<article class="card">
    <h3><a href="${predictionUrl(match)}">${escapeHtml(match.player_a_name)} vs ${escapeHtml(match.player_b_name)}</a></h3>
    <p class="muted">${escapeHtml(match.tour)} · ${escapeHtml(formatDate(match.start_time))} UTC · ${escapeHtml(match.surface || "Surface TBC")}</p>
    <p><strong>Pick:</strong> ${escapeHtml(match.predicted_winner_name || "Pending")} · <strong>Confidence:</strong> ${escapeHtml(match.confidence ? `${match.confidence}%` : "Pending")} · <strong>Odds:</strong> ${escapeHtml(match.predicted_odds || "N/A")}</p>
  </article>`).join("")}</div>`;
}

function renderKeyPlayers(matches) {
  const seen = new Map();
  for (const match of matches) {
    for (const name of [match.player_a_name, match.player_b_name].filter(Boolean)) {
      const key = `${match.tour}:${name}`;
      seen.set(key, { name, tour: match.tour, count: (seen.get(key)?.count || 0) + 1 });
    }
  }
  const players = [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 24);
  if (!players.length) return `<p class="muted">Key player links will appear after tournament matches sync.</p>`;
  return `<div class="inline-links">${players.map((player) => `<a href="${playerUrl(player.tour, player.name)}">${escapeHtml(player.name)}</a>`).join("")}</div>`;
}

function renderNews(news, tournament) {
  if (!news.length) return `<p class="muted">No dedicated ${escapeHtml(tournament)} news article is stored yet. Check the main tennis news feed while related stories sync.</p>`;
  return `<div class="grid">${news.map((article) => `<article class="card">
    <p class="pill">${escapeHtml(article.source_type || "News")}</p>
    <h3><a href="/articles/${escapeHtml(article.slug)}/">${escapeHtml(article.title)}</a></h3>
    <p class="muted">${escapeHtml(article.excerpt || article.description || "TennisTipz tournament news context.")}</p>
  </article>`).join("")}</div>`;
}

function renderTournamentPage(summary, matches, news) {
  const canonicalSlug = canonicalTournamentSlug(summary.tournament);
  const canonical = `${SITE_URL}/tournaments/${canonicalSlug}/`;
  const meta = TOURNAMENT_META[canonicalSlug] || {};
  const surfaces = String(summary.surfaces || "").split(",").filter(Boolean);
  const surface = meta.surface || mode(surfaces) || "TBC";
  const location = meta.location || "Location TBC";
  const level = meta.level || (String(summary.tours || "").includes("ATP") ? "ATP tournament" : "Tennis tournament");
  const title = `${summary.tournament} Predictions, Schedule, Draw & Tennis News | TennisTipz`;
  const description = `${summary.tournament} tournament hub with schedule, ${surface} surface notes, key players, latest predictions, draw links, related news, and TennisTipz betting research.`;
  const overview = tournamentOverview(summary, matches);
  const startDate = isoDateOrUndefined(summary.first_start);
  const endDate = isoDateOrUndefined(summary.last_start);
  const schema = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: summary.tournament,
    url: canonical,
    sport: "Tennis",
    description,
    startDate,
    endDate,
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: location },
    organizer: { "@type": "Organization", name: "ATP/WTA tennis" },
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "TennisTipz", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Tournaments", item: `${SITE_URL}/tennis-predictions/` },
      { "@type": "ListItem", position: 3, name: summary.tournament, item: canonical },
    ],
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="TennisTipz">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${SITE_URL}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${SITE_URL}/og-image.png">
<link rel="stylesheet" href="/ad-banners.css?v=navy-rails">
<script type="application/ld+json">${jsonLd(schema)}</script>
<script type="application/ld+json">${jsonLd(breadcrumbSchema)}</script>
<style>body{margin:0;background:#07111f;color:#e5edf7;font-family:Arial,sans-serif;line-height:1.65}.wrap{max-width:1120px;margin:auto;padding:32px 18px}.crumb,.muted{color:#94a3b8}a{color:#bef264}.pill{display:inline-block;background:#bef264;color:#08111f;font-weight:700;padding:6px 10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}.card,.row{background:#111c2d;border:1px solid rgba(255,255,255,.1);padding:18px}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;margin-top:10px}.big{font-size:28px;font-weight:900;color:#fff}.section{margin-top:34px}.link-cloud{display:inline-block;background:#bef264;color:#08111f;font-weight:900;text-decoration:none;padding:12px 16px;margin-top:12px}.inline-links{display:flex;flex-wrap:wrap;gap:10px}.inline-links a{background:#111c2d;border:1px solid rgba(255,255,255,.12);padding:8px 10px;text-decoration:none}@media(max-width:760px){.row{grid-template-columns:1fr}}h1{font-size:clamp(36px,6vw,64px);line-height:1.05;margin-bottom:12px}h2{margin-top:0}</style>
</head><body><main class="wrap">
<p class="crumb"><a href="/">TennisTipz</a> / <a href="/tennis-predictions/">Tennis predictions</a> / Tournaments</p>
<span class="pill">${escapeHtml(level)}</span>
<h1>${escapeHtml(summary.tournament)} Predictions, Schedule, Draw & Tennis News</h1>
<p class="muted">${escapeHtml(overview)}</p>
<a class="link-cloud" href="${CLOUDBET_URL}" rel="sponsored nofollow noreferrer" target="_blank">Compare tennis odds</a>
<section class="section grid">
  ${renderMetric("Dates", `${formatDateOnly(summary.first_start)} - ${formatDateOnly(summary.last_start)}`, "Based on stored match schedule")}
  ${renderMetric("Location", location, level)}
  ${renderMetric("Surface", surface, surfaces.length ? `Stored surfaces: ${surfaces.join(", ")}` : "Surface source not available yet")}
  ${renderMetric("Stored matches", String(asNumber(summary.match_count)), String(summary.tours || "ATP/WTA"))}
</section>
<section class="section">
  <h2>Schedule</h2>
  ${renderSchedule(matches)}
</section>
<section class="section">
  <h2>Draw Links and Key Players</h2>
  <p class="muted">Use these draw-style links to jump from the tournament hub into player pages, match pages, and tour prediction hubs.</p>
  ${renderKeyPlayers(matches)}
  <div class="inline-links" style="margin-top:14px"><a href="/atp-predictions/">ATP predictions</a><a href="/wta-predictions/">WTA predictions</a><a href="/tennis-predictions/">All tennis predictions</a></div>
</section>
<section class="section">
  <h2>Latest Predictions</h2>
  ${renderPredictions(matches)}
</section>
<section class="section">
  <h2>Latest News</h2>
  ${renderNews(news, summary.tournament)}
</section>
<p class="muted section">18+ Bet responsibly. Tournament hubs are research pages based on stored TennisTipz data, not guaranteed betting outcomes.</p>
</main><script src="/ad-banners.js?v=navy-rails" defer></script></body></html>`;
}

export async function onRequestGet({ params, request, env }) {
  const redirect = canonicalRedirect(request);
  if (redirect) return redirect;
  if (!env.TENNIS_DB) return new Response("Missing database", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });

  const requestedSlug = canonicalTournamentSlug(params.slug || "");
  const summary = await tournamentSummary(env.TENNIS_DB, requestedSlug);
  if (!summary) return new Response("Tournament not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

  const canonicalSlug = canonicalTournamentSlug(summary.tournament);
  if (requestedSlug !== canonicalSlug) {
    return Response.redirect(`${SITE_URL}/tournaments/${canonicalSlug}/`, 301);
  }

  const [matches, news] = await Promise.all([
    tournamentMatches(env.TENNIS_DB, summary.tournament),
    relatedNews(env.TENNIS_DB, summary.tournament),
  ]);

  return new Response(renderTournamentPage(summary, matches, news), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=1800",
    },
  });
}
