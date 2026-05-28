const SITE_URL = "https://www.tennistipz.win";

function sitemapEntry(path) {
  const today = new Date().toISOString().slice(0, 10);
  return `  <sitemap>\n    <loc>${SITE_URL}${path}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`;
}

export async function onRequestGet() {
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
