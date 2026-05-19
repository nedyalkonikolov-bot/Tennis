const SITE_URL = "https://www.tennistipz.win";

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

function urlEntry(path, priority = "0.70", changefreq = "daily") {
  return `  <url>\n    <loc>${xmlEscape(`${SITE_URL}${path}`)}</loc>\n    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

export async function onRequestGet({ env }) {
  const entries = [];

  if (env.TENNIS_DB) {
    const [players, matches, articles] = await Promise.all([
      env.TENNIS_DB.prepare(`
        SELECT name, tour
        FROM players
        WHERE tour IN ('ATP', 'WTA') AND current_rank IS NOT NULL
        ORDER BY tour ASC, current_rank ASC
        LIMIT 1000
      `).all(),
      env.TENNIS_DB.prepare(`
        SELECT tour, player_a_name, player_b_name
        FROM matches
        WHERE tour IN ('ATP', 'WTA')
        ORDER BY updated_at DESC
        LIMIT 500
      `).all(),
      env.TENNIS_DB.prepare(`
        SELECT slug
        FROM seo_articles
        WHERE status = 'published'
        ORDER BY created_at DESC
        LIMIT 500
      `).all().catch(() => ({ results: [] })),
    ]);

    for (const player of players.results || []) {
      entries.push(urlEntry(`/players/${String(player.tour).toLowerCase()}/${slugify(player.name)}/`, "0.72", "weekly"));
    }

    for (const match of matches.results || []) {
      entries.push(urlEntry(`/predictions/${slugify(`${match.tour} ${match.player_a_name} vs ${match.player_b_name}`)}/`, "0.74", "daily"));
    }

    for (const article of articles.results || []) {
      entries.push(urlEntry(`/articles/${article.slug}/`, "0.78", "daily"));
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
