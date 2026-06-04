const SITE_URL = "https://www.tennistipz.win";
const CANONICAL_HOST = "www.tennistipz.win";

function urlEntry(path, lastmod, changefreq, priority) {
  return `  <url>\n    <loc>${SITE_URL}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

function canonicalRedirect(request) {
  const url = new URL(request.url);
  if (url.hostname === CANONICAL_HOST && url.protocol === "https:") return null;
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  return Response.redirect(url.toString(), 301);
}

export async function onRequestGet({ request }) {
  const redirect = canonicalRedirect(request);
  if (redirect) return redirect;

  const entries = [
    urlEntry("/", "2026-05-28", "hourly", "1.0"),
    urlEntry("/tennis-predictions/", "2026-05-28", "hourly", "0.98"),
    urlEntry("/tennis-predictions-today/", "2026-05-28", "hourly", "0.96"),
    urlEntry("/atp-predictions/", "2026-05-28", "hourly", "0.92"),
    urlEntry("/wta-predictions/", "2026-05-28", "hourly", "0.92"),
    urlEntry("/player-stats/", "2026-05-28", "daily", "0.9"),
    urlEntry("/players/atp/", "2026-05-28", "daily", "0.88"),
    urlEntry("/players/wta/", "2026-05-28", "daily", "0.88"),
    urlEntry("/tennis-news/", "2026-05-28", "hourly", "0.85"),
    urlEntry("/tennis-betting/", "2026-05-28", "weekly", "0.9"),
    urlEntry("/tennis-betting-tips/", "2026-05-28", "daily", "0.92"),
    urlEntry("/cloudbet-tennis-betting/", "2026-06-04", "weekly", "0.92"),
    urlEntry("/stake-tennis-betting/", "2026-06-04", "weekly", "0.9"),
    urlEntry("/bc-game-tennis-betting/", "2026-06-04", "weekly", "0.9"),
    urlEntry("/crypto-tennis-betting/", "2026-05-28", "weekly", "0.9"),
    urlEntry("/betting-sites/", "2026-05-28", "weekly", "0.9"),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, no-transform",
    },
  });
}
