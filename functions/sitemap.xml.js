const SITE_URL = "https://www.tennistipz.win";
const CANONICAL_HOST = "www.tennistipz.win";

function sitemapEntry(path) {
  const today = new Date().toISOString().slice(0, 10);
  return `  <sitemap>\n    <loc>${SITE_URL}${path}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`;
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

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    sitemapEntry("/static-sitemap.xml"),
    sitemapEntry("/dynamic-sitemap.xml"),
  ].join("\n")}\n</sitemapindex>\n`;
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=900",
    },
  });
}
