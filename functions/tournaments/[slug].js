const SITE_URL = "https://www.tennistipz.win";
const CANONICAL_HOST = "www.tennistipz.win";
const CLOUDBET_URL = "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Predictions&aftm_cid=4";
const MIN_FEATURED_PICK_ODDS = 1.4;

const TOURNAMENT_META = {
  "australian-open": { location: "Melbourne, Australia", level: "Grand Slam", surface: "Hard" },
  "french-open": {
    location: "Paris, France",
    level: "Grand Slam",
    surface: "Clay",
    venue: "Stade Roland-Garros",
    organizer: "Federation Francaise de Tennis",
    address: { streetAddress: "2 avenue Gordon Bennett", addressLocality: "Paris", postalCode: "75016", addressCountry: "FR" },
  },
  "roland-garros": {
    location: "Paris, France",
    level: "Grand Slam",
    surface: "Clay",
    venue: "Stade Roland-Garros",
    organizer: "Federation Francaise de Tennis",
    address: { streetAddress: "2 avenue Gordon Bennett", addressLocality: "Paris", postalCode: "75016", addressCountry: "FR" },
  },
  "wimbledon": {
    location: "London, United Kingdom",
    level: "Grand Slam",
    surface: "Grass",
    dates: "29 June - 12 July 2026",
    edition: "139th edition",
    venue: "The All England Lawn Tennis Club",
    organizer: "The All England Lawn Tennis Club (Championships) Limited",
    address: { streetAddress: "Church Road", addressLocality: "Wimbledon", addressRegion: "London", postalCode: "SW19 5AE", addressCountry: "GB" },
  },
  "us-open": {
    location: "New York, United States",
    level: "Grand Slam",
    surface: "Hard",
    venue: "USTA Billie Jean King National Tennis Center",
    organizer: "United States Tennis Association",
    address: { streetAddress: "Flushing Meadows - Corona Park", addressLocality: "Flushing", addressRegion: "NY", postalCode: "11368", addressCountry: "US" },
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

function tournamentOccurrenceDates(matches) {
  const dates = matches
    .map((match) => match.start_time ? new Date(match.start_time) : null)
    .filter((date) => date && !Number.isNaN(date.getTime()));
  if (!dates.length) return { startDate: undefined, endDate: undefined };
  const latestYear = Math.max(...dates.map((date) => date.getUTCFullYear()));
  const occurrence = dates.filter((date) => date.getUTCFullYear() === latestYear).sort((a, b) => a - b);
  return {
    startDate: occurrence[0]?.toISOString(),
    endDate: occurrence[occurrence.length - 1]?.toISOString(),
  };
}

function tournamentFallbackDates(summary, canonicalSlug) {
  if (canonicalSlug === "wimbledon") {
    return {
      startDate: "2026-06-29T10:00:00.000Z",
      endDate: "2026-07-12T18:00:00.000Z",
    };
  }
  return {
    startDate: summary.first_start ? new Date(summary.first_start).toISOString() : undefined,
    endDate: summary.last_start ? new Date(summary.last_start).toISOString() : undefined,
  };
}

function eventStatus(startDate, endDate) {
  const now = Date.now();
  if (Date.parse(endDate) < now) return "https://schema.org/EventCompleted";
  if (Date.parse(startDate) <= now) return "https://schema.org/EventInProgress";
  return "https://schema.org/EventScheduled";
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
  if (slug === "wimbledon") {
    const summary = await db.prepare(`
      SELECT
        'Wimbledon' AS tournament,
        COUNT(*) AS match_count,
        MIN(CASE WHEN date(substr(start_time, 1, 10)) >= date('2020-01-01') THEN start_time END) AS first_start,
        MAX(CASE WHEN date(substr(start_time, 1, 10)) >= date('2020-01-01') THEN start_time END) AS last_start,
        GROUP_CONCAT(DISTINCT tour) AS tours,
        GROUP_CONCAT(DISTINCT surface) AS surfaces
      FROM matches
      WHERE tournament IS NOT NULL
        AND tournament <> ''
        AND LOWER(tournament) LIKE '%wimbledon%'
        AND tour IN ('ATP', 'WTA')
    `).first();
    if (summary && asNumber(summary.match_count) > 0) return summary;
    return {
      tournament: "Wimbledon",
      match_count: 0,
      first_start: "2026-06-29T10:00:00Z",
      last_start: "2026-07-12T18:00:00Z",
      tours: "ATP,WTA",
      surfaces: "Grass",
    };
  }

  const result = await db.prepare(`
    SELECT
      tournament,
      COUNT(*) AS match_count,
      MIN(CASE WHEN date(substr(start_time, 1, 10)) >= date('2020-01-01') THEN start_time END) AS first_start,
      MAX(CASE WHEN date(substr(start_time, 1, 10)) >= date('2020-01-01') THEN start_time END) AS last_start,
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
  const isWimbledon = canonicalTournamentSlug(tournament) === "wimbledon";
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
      m.score,
      m.winner_name,
      p.id AS prediction_id,
      p.predicted_winner_name,
      p.confidence,
      p.predicted_odds,
      p.created_at AS prediction_created_at
    FROM matches m
    LEFT JOIN predictions p ON p.match_id = m.id
    WHERE (m.tournament = ? OR (? = 1 AND LOWER(m.tournament) LIKE '%wimbledon%'))
      AND m.tour IN ('ATP', 'WTA')
      AND COALESCE(m.player_a_name, '') NOT LIKE '%/%'
      AND COALESCE(m.player_b_name, '') NOT LIKE '%/%'
    ORDER BY
      m.live DESC,
      CASE
        WHEN datetime(COALESCE(m.start_time, p.created_at, m.updated_at)) >= datetime('now', '-3 hours') THEN 0
        ELSE 1
      END ASC,
      CASE
        WHEN datetime(COALESCE(m.start_time, p.created_at, m.updated_at)) >= datetime('now', '-3 hours')
        THEN datetime(COALESCE(m.start_time, p.created_at, m.updated_at))
      END ASC,
      datetime(COALESCE(m.start_time, p.created_at, m.updated_at)) DESC
    LIMIT 220
  `).bind(tournament, isWimbledon ? 1 : 0).all();
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
  const dateText = meta.dates || (summary.first_start || summary.last_start ? `${formatDateOnly(summary.first_start)} to ${formatDateOnly(summary.last_start)}` : "dates still syncing");
  const playerCount = new Set(matches.flatMap((match) => [match.player_a_name, match.player_b_name]).filter(Boolean)).size;
  return `${summary.tournament} is tracked on TennisTipz as a ${meta.level || tours} tennis tournament with ${asNumber(summary.match_count)} stored singles matches, ${playerCount} key players in the current database sample, ${surface} surface context, and tournament dates listed as ${dateText}. This hub combines schedule rows, draw-style player links, latest predictions, related news, and betting research links in one indexable page.`;
}

function renderMetric(label, value, helper = "") {
  return `<div class="card"><strong>${escapeHtml(label)}</strong><br><span class="big">${escapeHtml(value)}</span>${helper ? `<p class="muted">${escapeHtml(helper)}</p>` : ""}</div>`;
}

function renderSchedule(matches) {
  const now = Date.now();
  const schedule = matches
    .filter((match) => match.live || !match.start_time || Date.parse(match.start_time) >= now - 3 * 60 * 60 * 1000)
    .slice(0, 24);
  if (!schedule.length) return `<p class="muted">No upcoming schedule rows are stored for this tournament yet. The hub will fill when the daily sync adds ATP/WTA matches.</p>`;
  return `<div class="list-cards">${schedule.map((match) => `<article class="row">
    <div><strong><a href="${playerUrl(match.tour, match.player_a_name)}">${escapeHtml(match.player_a_name)}</a> vs <a href="${playerUrl(match.tour, match.player_b_name)}">${escapeHtml(match.player_b_name)}</a></strong><p class="muted">${escapeHtml(match.tour)} · ${escapeHtml(formatDate(match.start_time))} UTC · ${escapeHtml(match.surface || "Surface TBC")}</p></div>
    <div><span class="pill">${escapeHtml(match.live ? "Live" : match.status || "Scheduled")}</span>${match.prediction_id ? `<p><a href="${predictionUrl(match)}">prediction page</a></p>` : ""}</div>
  </article>`).join("")}</div>`;
}

function renderResults(matches) {
  const results = matches
    .filter((match) => match.winner_name || /finished|complete|ended|final/i.test(String(match.status || "")))
    .sort((a, b) => Date.parse(b.start_time || 0) - Date.parse(a.start_time || 0))
    .slice(0, 24);
  if (!results.length) return `<p class="muted">No completed result rows are stored yet. Wimbledon results will appear here as the API-Tennis sync settles matches.</p>`;
  return `<div class="list-cards">${results.map((match) => `<article class="row">
    <div><strong><a href="${playerUrl(match.tour, match.player_a_name)}">${escapeHtml(match.player_a_name)}</a> vs <a href="${playerUrl(match.tour, match.player_b_name)}">${escapeHtml(match.player_b_name)}</a></strong><p class="muted">${escapeHtml(match.tour)} · ${escapeHtml(formatDate(match.start_time))} UTC · ${escapeHtml(match.surface || "Grass")}</p></div>
    <div><span class="pill">${escapeHtml(match.winner_name ? `Winner: ${match.winner_name}` : match.status || "Result")}</span>${match.score ? `<p class="muted">${escapeHtml(match.score)}</p>` : ""}${match.prediction_id ? `<p><a href="${predictionUrl(match)}">prediction review</a></p>` : ""}</div>
  </article>`).join("")}</div>`;
}

function renderPredictions(matches) {
  const predictions = matches
    .filter((match) => match.prediction_id)
    .filter((match) => asNumber(match.predicted_odds) >= MIN_FEATURED_PICK_ODDS)
    .sort((a, b) => asNumber(b.confidence) - asNumber(a.confidence) || Date.parse(a.start_time || 0) - Date.parse(b.start_time || 0))
    .slice(0, 12);
  if (!predictions.length) return `<p class="muted">No featured prediction above ${MIN_FEATURED_PICK_ODDS} odds is attached to this tournament yet. New ATP/WTA betting markets appear when the model, confidence and odds filters pass.</p>`;
  return `<div class="grid">${predictions.map((match) => `<article class="card">
    <h3><a href="${predictionUrl(match)}">${escapeHtml(match.player_a_name)} vs ${escapeHtml(match.player_b_name)}</a></h3>
    <p class="muted">${escapeHtml(match.tour)} · ${escapeHtml(formatDate(match.start_time))} UTC · ${escapeHtml(match.surface || "Surface TBC")}</p>
    <p><strong>Pick:</strong> ${escapeHtml(match.predicted_winner_name || "Pending")} · <strong>Confidence:</strong> ${escapeHtml(match.confidence ? `${match.confidence}%` : "Pending")} · <strong>Odds:</strong> ${escapeHtml(match.predicted_odds || "N/A")}</p>
  </article>`).join("")}</div>`;
}

function renderWimbledonCorner(matches) {
  const totalPredictions = matches.filter((match) => match.prediction_id).length;
  const liveCount = matches.filter((match) => match.live).length;
  const resultCount = matches.filter((match) => match.winner_name || /finished|complete|ended|final/i.test(String(match.status || ""))).length;
  return `<section class="section wimbledon-corner">
  <h2>Wimbledon Corner: Grass-Court Betting Research</h2>
  <p class="muted">Wimbledon is the only Grand Slam played on grass, so surface context, serve pressure, short-point variance, draw position and late news matter more than usual. This corner is built for the 2026 Championships window, 29 June to 12 July, and updates around the stored ATP/WTA match feed.</p>
  <div class="grid">
    ${renderMetric("Live now", String(liveCount), "Matches marked live in the database")}
    ${renderMetric("Predictions", String(totalPredictions), "Indexed Wimbledon prediction pages")}
    ${renderMetric("Results stored", String(resultCount), "Completed rows from synced match data")}
    ${renderMetric("Surface", "Grass", "Fast points, serve holds, low-bounce rallies")}
  </div>
  <div class="grid narrative-grid">
    <article class="card"><h3>What matters on grass</h3><p class="muted">Grass can reward first-strike tennis, clean serving, quick net instincts and players who stay calm through short-point variance. A favorite can still be vulnerable if the price is too short or the opponent has a serve-heavy profile.</p></article>
    <article class="card"><h3>How to read Wimbledon odds</h3><p class="muted">Compare the current price against ranking level, current form, draw fatigue and the player’s comfort on grass. Skip matches where the market has already moved past the model edge.</p></article>
    <article class="card"><h3>Daily workflow</h3><p class="muted">Start with the schedule, open the match prediction page, check player profiles, then review late withdrawals, court order and weather or roof context before using any pick.</p></article>
  </div>
</section>`;
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

function renderTournamentPage(summary, matches, news, options = {}) {
  const canonicalSlug = canonicalTournamentSlug(summary.tournament);
  const canonical = options.canonicalPath ? `${SITE_URL}${options.canonicalPath}` : `${SITE_URL}/tournaments/${canonicalSlug}/`;
  const meta = TOURNAMENT_META[canonicalSlug] || {};
  const surfaces = String(summary.surfaces || "").split(",").filter(Boolean);
  const surface = meta.surface || mode(surfaces) || "TBC";
  const location = meta.location || "Location TBC";
  const level = meta.level || (String(summary.tours || "").includes("ATP") ? "ATP tournament" : "Tennis tournament");
  const isWimbledon = canonicalSlug === "wimbledon";
  const title = isWimbledon ? "Wimbledon 2026 Predictions, Schedule, Results & Tennis Tips | TennisTipz" : `${summary.tournament} Predictions, Schedule, Draw & Tennis News | TennisTipz`;
  const description = isWimbledon
    ? "Wimbledon 2026 hub with ATP and WTA schedule, results, grass-court predictions, player links, news, odds context and responsible tennis betting research."
    : `${summary.tournament} tournament hub with schedule, ${surface} surface notes, key players, latest predictions, draw links, related news, and TennisTipz betting research.`;
  const overview = tournamentOverview(summary, matches);
  const occurrenceDates = canonicalSlug === "wimbledon" ? {} : tournamentOccurrenceDates(matches);
  const fallbackDates = tournamentFallbackDates(summary, canonicalSlug);
  const startDate = canonicalSlug === "wimbledon" ? fallbackDates.startDate : occurrenceDates.startDate || fallbackDates.startDate;
  const endDate = canonicalSlug === "wimbledon" ? fallbackDates.endDate : occurrenceDates.endDate || fallbackDates.endDate;
  const competitors = [...new Set(matches.flatMap((match) => [match.player_a_name, match.player_b_name]).filter(Boolean))]
    .slice(0, 12)
    .map((name) => ({ "@type": "Person", name, sport: "Tennis" }));
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonical}#webpage`,
    name: isWimbledon ? "Wimbledon 2026 Tournament Corner" : summary.tournament,
    url: canonical,
    description,
    image: `${SITE_URL}/og-image.png`,
    isAccessibleForFree: true,
    about: { "@type": "Thing", name: summary.tournament, description: `${level} tennis tournament` },
  };
  const eventSchema = startDate && endDate && meta.venue && meta.organizer && meta.address ? {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": `${canonical}#event`,
    name: summary.tournament,
    url: canonical,
    sport: "Tennis",
    description,
    image: `${SITE_URL}/og-image.png`,
    startDate,
    endDate,
    eventStatus: eventStatus(startDate, endDate),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: meta.venue,
      address: { "@type": "PostalAddress", ...meta.address },
    },
    organizer: { "@type": "Organization", name: meta.organizer },
    performer: competitors.length ? competitors : undefined,
  } : null;
  const predictionItems = matches.filter((match) => match.prediction_id).slice(0, 10).map((match, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: `${SITE_URL}${predictionUrl(match)}`,
    name: `${match.player_a_name} vs ${match.player_b_name} Prediction`,
  }));
  const itemListSchema = predictionItems.length ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${canonical}#predictions`,
    name: `${summary.tournament} predictions`,
    itemListElement: predictionItems,
  } : null;
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "TennisTipz", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Tournaments", item: `${SITE_URL}/tennis-predictions/` },
      { "@type": "ListItem", position: 3, name: isWimbledon ? "Wimbledon" : summary.tournament, item: canonical },
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
<script type="application/ld+json">${jsonLd(pageSchema)}</script>
${eventSchema ? `<script type="application/ld+json">${jsonLd(eventSchema)}</script>` : ""}
${itemListSchema ? `<script type="application/ld+json">${jsonLd(itemListSchema)}</script>` : ""}
<script type="application/ld+json">${jsonLd(breadcrumbSchema)}</script>
<style>body{margin:0;background:radial-gradient(circle at 82% 10%,rgba(91,33,182,.22),transparent 28rem),radial-gradient(circle at 8% 18%,rgba(190,242,100,.12),transparent 24rem),#07111f;color:#e5edf7;font-family:Arial,sans-serif;line-height:1.65}.wrap{max-width:1120px;margin:auto;padding:32px 18px}.crumb,.muted{color:#94a3b8}a{color:#bef264}.pill{display:inline-block;background:#bef264;color:#08111f;font-weight:700;padding:6px 10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}.card,.row{background:#111c2d;border:1px solid rgba(255,255,255,.1);padding:18px}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;margin-top:10px}.big{font-size:28px;font-weight:900;color:#fff}.section{margin-top:34px}.hero-panel{padding:24px;background:linear-gradient(135deg,rgba(88,28,135,.45),rgba(15,23,42,.72));border:1px solid rgba(190,242,100,.2)}.link-cloud{display:inline-block;background:#bef264;color:#08111f;font-weight:900;text-decoration:none;padding:12px 16px;margin-top:12px}.inline-links{display:flex;flex-wrap:wrap;gap:10px}.inline-links a{background:#111c2d;border:1px solid rgba(255,255,255,.12);padding:8px 10px;text-decoration:none}.narrative-grid p{font-size:15px;line-height:1.7}.wimbledon-corner{border:1px solid rgba(190,242,100,.18);background:rgba(190,242,100,.04);padding:22px}@media(max-width:760px){.row{grid-template-columns:1fr}}h1{font-size:clamp(36px,6vw,64px);line-height:1.05;margin-bottom:12px}h2{margin-top:0}</style>
</head><body><main class="wrap">
<p class="crumb"><a href="/">TennisTipz</a> / <a href="/tennis-predictions/">Tennis predictions</a> / Tournaments</p>
<section class="hero-panel">
  <span class="pill">${escapeHtml(isWimbledon ? "Wimbledon 2026 corner" : level)}</span>
  <h1>${escapeHtml(isWimbledon ? "Wimbledon 2026 Predictions, Schedule, Results & Tennis Betting Corner" : `${summary.tournament} Predictions, Schedule, Draw & Tennis News`)}</h1>
  <p class="muted">${escapeHtml(overview)}</p>
  <a class="link-cloud" href="${CLOUDBET_URL}" rel="sponsored nofollow noreferrer" target="_blank">Compare tennis odds</a>
</section>
<section class="section grid">
  ${renderMetric("Dates", meta.dates || `${formatDateOnly(summary.first_start)} - ${formatDateOnly(summary.last_start)}`, "Based on stored match schedule")}
  ${renderMetric("Location", location, level)}
  ${renderMetric("Surface", surface, surfaces.length ? `Stored surfaces: ${surfaces.join(", ")}` : "Surface source not available yet")}
  ${renderMetric("Stored matches", String(asNumber(summary.match_count)), String(summary.tours || "ATP/WTA"))}
</section>
${isWimbledon ? renderWimbledonCorner(matches) : ""}
<section class="section">
  <h2>${escapeHtml(isWimbledon ? "Wimbledon Schedule: Live and Upcoming Matches" : "Schedule")}</h2>
  ${renderSchedule(matches)}
</section>
${isWimbledon ? `<section class="section"><h2>Wimbledon Results</h2>${renderResults(matches)}</section>` : ""}
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

export async function renderTournamentResponse({ slug, request, env, canonicalPath = null }) {
  const redirect = canonicalRedirect(request);
  if (redirect) return redirect;
  if (!env.TENNIS_DB) return new Response("Missing database", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });

  const requestedSlug = canonicalTournamentSlug(slug || "");
  const summary = await tournamentSummary(env.TENNIS_DB, requestedSlug);
  if (!summary) return new Response("Tournament not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

  const canonicalSlug = canonicalTournamentSlug(summary.tournament);
  if (!canonicalPath && canonicalSlug === "wimbledon") {
    return Response.redirect(`${SITE_URL}/wimbledon/`, 301);
  }
  if (requestedSlug !== canonicalSlug) {
    return Response.redirect(`${SITE_URL}/tournaments/${canonicalSlug}/`, 301);
  }

  const [matches, news] = await Promise.all([
    tournamentMatches(env.TENNIS_DB, summary.tournament),
    relatedNews(env.TENNIS_DB, summary.tournament),
  ]);

  return new Response(renderTournamentPage(summary, matches, news, { canonicalPath }), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=1800",
    },
  });
}

export async function onRequestGet({ params, request, env }) {
  return renderTournamentResponse({ slug: params.slug, request, env });
}
