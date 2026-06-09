const SITE_URL = "https://www.tennistipz.win";
const CANONICAL_HOST = "www.tennistipz.win";
const MIN_INDEXED_PICK_ODDS = 1.01;
const MAX_INDEXED_PICK_ODDS = 2.0;
const MIN_INDEXED_CONFIDENCE = 70;

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function canonicalTournamentSlug(name = "") {
  const raw = slugify(name);
  if (/roland-garros|french-open|france-open/.test(raw)) return "french-open";
  if (/australian-open|aus-open/.test(raw)) return "australian-open";
  if (/us-open|u-s-open|united-states-open/.test(raw)) return "us-open";
  if (/wimbledon/.test(raw)) return "wimbledon";
  return raw;
}

function sitemapDate(value) {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function urlEntry(path, priority = "0.70", changefreq = "daily", lastmod = null) {
  return `  <url>\n    <loc>${xmlEscape(`${SITE_URL}${path}`)}</loc>\n    <lastmod>${sitemapDate(lastmod)}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

function canonicalRedirect(request) {
  const url = new URL(request.url);
  if (url.hostname === CANONICAL_HOST && url.protocol === "https:") return null;
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  return Response.redirect(url.toString(), 301);
}

export async function onRequestGet({ env, request }) {
  const redirect = canonicalRedirect(request);
  if (redirect) return redirect;

  const entries = [];
  const seen = new Set();
  const addEntry = (path, priority, changefreq, lastmod) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    entries.push(urlEntry(path, priority, changefreq, lastmod));
  };

  if (env.TENNIS_DB) {
    const [players, matches, tournaments, articles] = await Promise.all([
      env.TENNIS_DB.prepare(`
        SELECT name, tour, updated_at
        FROM players
        WHERE tour IN ('ATP', 'WTA') AND current_rank IS NOT NULL
        ORDER BY tour ASC, current_rank ASC
        LIMIT 1000
      `).all(),
      env.TENNIS_DB.prepare(`
        SELECT m.tour, m.player_a_name, m.player_b_name, COALESCE(p.created_at, m.updated_at) AS updated_at
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
      `).all(),
      env.TENNIS_DB.prepare(`
        SELECT
          tournament,
          GROUP_CONCAT(DISTINCT tour) AS tours,
          MAX(COALESCE(p.created_at, m.updated_at, m.start_time)) AS updated_at
        FROM matches m
        LEFT JOIN predictions p ON p.match_id = m.id
        WHERE m.tournament IS NOT NULL
          AND m.tournament <> ''
          AND m.tour IN ('ATP', 'WTA')
          AND COALESCE(m.player_a_name, '') NOT LIKE '%/%'
          AND COALESCE(m.player_b_name, '') NOT LIKE '%/%'
          AND (
            m.tour = 'ATP'
            OR LOWER(m.tournament) LIKE '%australian open%'
            OR LOWER(m.tournament) LIKE '%french open%'
            OR LOWER(m.tournament) LIKE '%roland garros%'
            OR LOWER(m.tournament) LIKE '%wimbledon%'
            OR LOWER(m.tournament) LIKE '%us open%'
          )
        GROUP BY tournament
        ORDER BY MAX(datetime(COALESCE(m.start_time, p.created_at, m.updated_at))) DESC
        LIMIT 250
      `).all(),
      env.TENNIS_DB.prepare(`
        SELECT slug, updated_at, created_at
        FROM seo_articles
        WHERE status = 'published'
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 500
      `).all().catch(() => ({ results: [] })),
    ]);

    for (const player of players.results || []) {
      addEntry(`/players/${String(player.tour).toLowerCase()}/${slugify(player.name)}/`, "0.72", "weekly", player.updated_at);
    }

    for (const match of matches.results || []) {
      addEntry(`/predictions/${slugify(`${match.tour} ${match.player_a_name} vs ${match.player_b_name}`)}/`, "0.74", "daily", match.updated_at);
    }

    for (const tournament of tournaments.results || []) {
      addEntry(`/tournaments/${canonicalTournamentSlug(tournament.tournament)}/`, "0.73", "daily", tournament.updated_at);
    }

    for (const article of articles.results || []) {
      addEntry(`/articles/${article.slug}/`, "0.78", "daily", article.updated_at || article.created_at);
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, no-transform",
    },
  });
}
