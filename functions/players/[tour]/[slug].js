const SITE_URL = "https://www.tennistipz.win";
const CANONICAL_HOST = "www.tennistipz.win";
const SEASON_STATS_YEAR = "2026";
const CLOUDBET_URL = "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Predictions&aftm_cid=4";

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
    .replace(/^-+|-+$/g, "") || "player";
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value) {
  return value === null || value === undefined ? "N/A" : `${asNumber(value).toFixed(1).replace(/\.0$/, "")}%`;
}

function wl(wins, losses) {
  return `${asNumber(wins)}-${asNumber(losses)}`;
}

function playerUrl(tour, name) {
  return `/players/${String(tour || "atp").toLowerCase()}/${slugify(name)}/`;
}

function predictionUrl(match) {
  return `/predictions/${slugify(`${match.tour} ${match.player_a_name} vs ${match.player_b_name}`)}/`;
}

function tournamentUrl(name) {
  return `/tournaments/${slugify(name)}/`;
}

function formatDate(value) {
  if (!value) return "date TBC";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 16);
  return parsed.toISOString().replace("T", " ").slice(0, 16);
}

function isoDateOrUndefined(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
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

function surfaceRows(player) {
  return [
    { name: "Hard", wins: player.hard_won, losses: player.hard_lost },
    { name: "Clay", wins: player.clay_won, losses: player.clay_lost },
    { name: "Grass", wins: player.grass_won, losses: player.grass_lost },
  ];
}

async function findPlayer(db, tour, slug) {
  const result = await db.prepare(`
    SELECT
      p.id,
      p.name,
      p.tour,
      p.country,
      p.current_rank,
      p.points,
      p.movement,
      p.player_bday,
      p.player_logo,
      p.updated_at,
      COALESCE(r.recent_matches, 0) AS recent_matches,
      COALESCE(r.recent_wins, 0) AS recent_wins,
      COALESCE(r.recent_losses, 0) AS recent_losses,
      CASE WHEN COALESCE(r.recent_matches, 0) > 0 THEN ROUND((r.recent_wins * 1000.0 / r.recent_matches)) / 10.0 ELSE NULL END AS recent_win_rate,
      s.season,
      s.season_rank,
      s.titles,
      s.matches_won,
      s.matches_lost,
      s.hard_won,
      s.hard_lost,
      s.clay_won,
      s.clay_lost,
      s.grass_won,
      s.grass_lost,
      (SELECT COUNT(*) FROM predictions pr JOIN matches m ON m.id = pr.match_id WHERE m.player_a_id = p.id OR m.player_b_id = p.id) AS prediction_mentions
    FROM players p
    LEFT JOIN (
      SELECT
        player_id,
        COUNT(*) AS recent_matches,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS recent_wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS recent_losses
      FROM player_recent_matches
      WHERE match_date >= date('now', '-100 days') AND source = 'api-tennis-fixtures'
      GROUP BY player_id
    ) r ON r.player_id = p.id
    LEFT JOIN player_season_stats s ON s.player_id = p.id AND s.type = 'singles' AND s.season = ?
    WHERE p.tour = ?
    ORDER BY COALESCE(p.current_rank, 999999) ASC, p.name ASC
    LIMIT 700
  `).bind(SEASON_STATS_YEAR, tour).all();
  return (result.results || []).find((row) => slugify(row.name) === slug);
}

async function latestMatches(db, playerId) {
  const result = await db.prepare(`
    SELECT match_date, tournament, surface, opponent_name, score, result, event_status, source_event_id
    FROM player_recent_matches
    WHERE player_id = ?
    ORDER BY match_date DESC
    LIMIT 10
  `).bind(playerId).all();
  return result.results || [];
}

async function relatedMatches(db, playerId) {
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
    WHERE m.player_a_id = ? OR m.player_b_id = ?
    ORDER BY m.live DESC, datetime(COALESCE(m.start_time, p.created_at, m.updated_at)) DESC
    LIMIT 40
  `).bind(playerId, playerId).all();
  return result.results || [];
}

async function relatedNews(db, playerName) {
  try {
    const like = `%${String(playerName).toLowerCase()}%`;
    const result = await db.prepare(`
      SELECT slug, title, description, excerpt, source_type, source_title, created_at, updated_at
      FROM seo_articles
      WHERE status = 'published'
        AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(excerpt) LIKE ? OR LOWER(body_html) LIKE ?)
      ORDER BY datetime(COALESCE(updated_at, created_at)) DESC
      LIMIT 6
    `).bind(like, like, like, like).all();
    return result.results || [];
  } catch (error) {
    if (!String(error.message || "").includes("seo_articles")) throw error;
    return [];
  }
}

function playerBio(player) {
  const rank = player.current_rank ? `ranked #${player.current_rank}` : "tracked in the TennisTipz database";
  const country = player.country ? ` from ${player.country}` : "";
  const recent = `${wl(player.recent_wins, player.recent_losses)} across the stored last-100-days singles sample`;
  const season = asNumber(player.matches_won) + asNumber(player.matches_lost) > 0 ? `${wl(player.matches_won, player.matches_lost)} in the ${SEASON_STATS_YEAR} singles season` : "with season stats still syncing";
  return `${player.name} is an ${player.tour} tennis player${country}, currently ${rank}. TennisTipz tracks ${player.name}'s rankings, points, recent form, surface profile, match history, upcoming prediction links, and tennis news context for betting research. The current database shows ${recent} and ${season}.`;
}

function renderMetric(label, value, helper = "") {
  return `<div class="card"><strong>${escapeHtml(label)}</strong><br><span class="big">${escapeHtml(value)}</span>${helper ? `<p class="muted">${escapeHtml(helper)}</p>` : ""}</div>`;
}

function renderMatchList(matches, emptyText, player) {
  if (!matches.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<div class="list-cards">${matches.map((match) => {
    const opponent = match.opponent_name || (match.player_a_id === player.id ? match.player_b_name : match.player_a_name);
    const tournamentLink = match.tournament ? `<a href="${tournamentUrl(match.tournament)}">${escapeHtml(match.tournament)}</a>` : "Tennis";
    const prediction = match.player_a_name ? `<a href="${predictionUrl(match)}">prediction page</a>` : "";
    return `<article class="row">
      <div><strong>${escapeHtml(opponent || "Opponent TBC")}</strong><p class="muted">${escapeHtml(formatDate(match.match_date || match.start_time))} · ${tournamentLink} · ${escapeHtml(match.surface || "Surface TBC")}</p></div>
      <div>${match.result ? `<span class="${match.result === "win" ? "win" : "loss"}">${escapeHtml(match.result)}</span>` : `<span class="pill">${escapeHtml(match.live ? "Live" : match.status || "Upcoming")}</span>`}${match.score ? `<p class="muted">${escapeHtml(match.score)}</p>` : ""}${prediction ? `<p>${prediction}</p>` : ""}</div>
    </article>`;
  }).join("")}</div>`;
}

function renderNews(news) {
  if (!news.length) return `<p class="muted">No dedicated ${escapeHtml("player")} news article has been stored yet. The page still links to the main tennis news feed while new related stories sync.</p>`;
  return `<div class="grid">${news.map((article) => `<article class="card">
    <p class="pill">${escapeHtml(article.source_type || "News")}</p>
    <h3><a href="/articles/${escapeHtml(article.slug)}/">${escapeHtml(article.title)}</a></h3>
    <p class="muted">${escapeHtml(article.excerpt || article.description || "TennisTipz tennis news context.")}</p>
  </article>`).join("")}</div>`;
}

function renderPlayerPage(player, latest, related, news, request) {
  const slug = slugify(player.name);
  const canonical = `${SITE_URL}/players/${String(player.tour).toLowerCase()}/${slug}/`;
  const title = `${player.name} Predictions, Stats, Form & Tennis News | TennisTipz`;
  const description = `${player.name} ${player.tour} profile with predictions, ranking, 2026 season record, 100-day form, surface stats, upcoming matches, latest results and tennis news.`;
  const image = player.player_logo || `${SITE_URL}/og-image.png`;
  const now = Date.now();
  const upcoming = related.filter((match) => match.live || (match.start_time && new Date(match.start_time).getTime() >= now - 3 * 60 * 60 * 1000)).slice(0, 8);
  const predictions = related.filter((match) => match.prediction_id).slice(0, 8);
  const opponents = [...new Set([...latest.map((match) => match.opponent_name), ...related.map((match) => match.player_a_id === player.id ? match.player_b_name : match.player_a_name)].filter(Boolean))].slice(0, 12);
  const tournaments = [...new Set([...latest.map((match) => match.tournament), ...related.map((match) => match.tournament)].filter(Boolean))].slice(0, 10);
  const bio = playerBio(player);
  const surfaces = surfaceRows(player);
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: player.name,
    url: canonical,
    image,
    nationality: player.country || undefined,
    birthDate: isoDateOrUndefined(player.player_bday)?.slice(0, 10),
    jobTitle: "Professional tennis player",
    sport: "Tennis",
    description,
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "TennisTipz", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Player stats", item: `${SITE_URL}/player-stats/` },
      { "@type": "ListItem", position: 3, name: `${player.tour} players`, item: `${SITE_URL}/players/${String(player.tour).toLowerCase()}/` },
      { "@type": "ListItem", position: 4, name: player.name, item: canonical },
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
<meta property="og:type" content="profile">
<meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<link rel="stylesheet" href="/ad-banners.css?v=navy-rails">
<script type="application/ld+json">${jsonLd(personSchema)}</script>
<script type="application/ld+json">${jsonLd(breadcrumbSchema)}</script>
<style>body{margin:0;background:#07111f;color:#e5edf7;font-family:Arial,sans-serif;line-height:1.65}.wrap{max-width:1120px;margin:auto;padding:32px 18px}.crumb,.muted{color:#94a3b8}a{color:#bef264}.pill{display:inline-block;background:#bef264;color:#08111f;font-weight:700;padding:6px 10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.card,.row{background:#111c2d;border:1px solid rgba(255,255,255,.1);padding:18px}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;margin-top:10px}.big{font-size:28px;font-weight:900;color:#fff}.section{margin-top:34px}.hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(220px,.55fr);gap:26px;align-items:center}.avatar{width:100%;max-width:260px;aspect-ratio:1;border:1px solid rgba(255,255,255,.12);object-fit:cover;background:#111c2d}.win{color:#bef264;font-weight:900;text-transform:uppercase}.loss{color:#fda4af;font-weight:900;text-transform:uppercase}.link-cloud{display:inline-block;background:#bef264;color:#08111f;font-weight:900;text-decoration:none;padding:12px 16px;margin-top:12px}.inline-links{display:flex;flex-wrap:wrap;gap:10px}.inline-links a{background:#111c2d;border:1px solid rgba(255,255,255,.12);padding:8px 10px;text-decoration:none}@media(max-width:760px){.hero,.row{grid-template-columns:1fr}.avatar{max-width:180px}}h1{font-size:clamp(36px,6vw,64px);line-height:1.05;margin-bottom:12px}h2{margin-top:0}</style>
</head><body><main class="wrap">
<p class="crumb"><a href="/">TennisTipz</a> / <a href="/player-stats/">Player stats</a> / <a href="/players/${String(player.tour).toLowerCase()}/">${escapeHtml(player.tour)}</a></p>
<section class="hero">
  <div>
    <span class="pill">${escapeHtml(player.tour)} player profile</span>
    <h1>${escapeHtml(player.name)} Predictions, Stats, Form & Tennis News</h1>
    <p class="muted">${escapeHtml(bio)}</p>
    <a class="link-cloud" href="${CLOUDBET_URL}" rel="sponsored nofollow noreferrer" target="_blank">Compare tennis odds</a>
  </div>
  <div>${player.player_logo ? `<img class="avatar" src="${escapeHtml(player.player_logo)}" alt="${escapeHtml(player.name)} tennis player photo">` : `<div class="avatar"></div>`}</div>
</section>
<section class="section grid">
  ${renderMetric("Rank", player.current_rank ? `#${player.current_rank}` : "N/A", player.country || "Country unavailable")}
  ${renderMetric("Points", String(asNumber(player.points)), "Ranking points")}
  ${renderMetric("100d W-L", wl(player.recent_wins, player.recent_losses), `${pct(player.recent_win_rate)} win rate from ${asNumber(player.recent_matches)} matches`)}
  ${renderMetric(`${SEASON_STATS_YEAR} Season`, wl(player.matches_won, player.matches_lost), `${asNumber(player.titles)} titles stored`)}
</section>
<section class="section">
  <h2>Surface Stats</h2>
  <div class="grid">${surfaces.map((surface) => renderMetric(surface.name, wl(surface.wins, surface.losses), asNumber(surface.wins) + asNumber(surface.losses) ? `${pct((asNumber(surface.wins) * 100) / Math.max(asNumber(surface.wins) + asNumber(surface.losses), 1))} win rate` : "Not enough verified surface data yet")).join("")}</div>
</section>
<section class="section">
  <h2>Recent Form and Latest Matches</h2>
  ${renderMatchList(latest, "No recent match rows are stored yet. The daily API-Tennis sync will fill this section as verified fixtures arrive.", player)}
</section>
<section class="section">
  <h2>Upcoming Matches</h2>
  ${renderMatchList(upcoming, `No upcoming ${player.name} matches are stored yet. Check the main predictions board for fresh ATP/WTA markets.`, player)}
</section>
<section class="section">
  <h2>Latest Related Predictions</h2>
  ${renderMatchList(predictions, `No indexed ${player.name} prediction is available yet. New Cloudbet ATP/WTA markets are added when odds and model data pass public filters.`, player)}
</section>
<section class="section">
  <h2>Latest Related News</h2>
  ${renderNews(news)}
</section>
<section class="section">
  <h2>Internal Research Links</h2>
  <p class="muted">Use these links to move between player, tournament, and prediction context without leaving TennisTipz.</p>
  <div class="inline-links">
    <a href="/tennis-predictions/">All tennis predictions</a>
    <a href="/${String(player.tour).toLowerCase()}-predictions/">${escapeHtml(player.tour)} predictions</a>
    <a href="/tennis-news/">Tennis news</a>
    ${opponents.map((name) => `<a href="${playerUrl(player.tour, name)}">${escapeHtml(name)}</a>`).join("")}
    ${tournaments.map((name) => `<a href="${tournamentUrl(name)}">${escapeHtml(name)}</a>`).join("")}
  </div>
</section>
<p class="muted section">18+ Bet responsibly. TennisTipz player pages are research signals and tennis context, not guaranteed betting outcomes.</p>
</main><script src="/ad-banners.js?v=navy-rails" defer></script></body></html>`;
}

export async function onRequestGet({ params, request, env }) {
  const redirect = canonicalRedirect(request);
  if (redirect) return redirect;
  if (!env.TENNIS_DB) return new Response("Missing database", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });

  const tour = String(params.tour || "").toUpperCase();
  const slug = String(params.slug || "");
  if (!["ATP", "WTA"].includes(tour) || !slug) {
    return new Response("Player not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const player = await findPlayer(env.TENNIS_DB, tour, slug);
  if (!player) {
    return new Response("Player not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const [latest, related, news] = await Promise.all([
    latestMatches(env.TENNIS_DB, player.id),
    relatedMatches(env.TENNIS_DB, player.id),
    relatedNews(env.TENNIS_DB, player.name),
  ]);

  return new Response(renderPlayerPage(player, latest, related, news, request), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=1800",
    },
  });
}
