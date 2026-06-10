const DEFAULT_BASE_URL = "https://www.tennistipz.win";
const DEFAULT_MAX_PAGES = 5000;
const DEFAULT_MAX_INTERNAL_LINKS = 2500;
const DEFAULT_CONCURRENCY = 8;

function optionValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const baseUrl = optionValue("--base-url", process.env.SEO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const maxPages = Number(optionValue("--max-pages", process.env.SEO_MAX_PAGES || DEFAULT_MAX_PAGES));
const maxInternalLinks = Number(optionValue("--max-links", process.env.SEO_MAX_INTERNAL_LINKS || DEFAULT_MAX_INTERNAL_LINKS));
const concurrency = Number(optionValue("--concurrency", process.env.SEO_CONCURRENCY || DEFAULT_CONCURRENCY));
const allowInsecureTls = process.argv.includes("--insecure") || process.env.SEO_INSECURE_TLS === "true";

if (allowInsecureTls) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const report = [];

function addCheck(name, passed, details = "") {
  report.push({ name, passed, details });
}

function errorDetails(error) {
  const parts = [error?.message, error?.cause?.code, error?.cause?.message].filter(Boolean);
  return [...new Set(parts)].join(" | ") || "unknown error";
}

function absoluteUrl(value) {
  try {
    return new URL(value, `${baseUrl}/`).toString();
  } catch {
    return null;
  }
}

function normalizePageUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString();
}

function isHtmlBody(body = "") {
  const trimmed = body.trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function stripTags(value = "") {
  return value.replace(/<[^>]*>/g, "").trim();
}

function extractTagAttribute(html, tagPattern, attribute) {
  const match = html.match(tagPattern);
  if (!match) return "";
  const attrMatch = match[0].match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
  return attrMatch?.[1]?.trim() || "";
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripTags(match?.[1] || "");
}

function extractMeta(html, name) {
  return extractTagAttribute(html, new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${name}["'])[^>]*>`, "i"), "content");
}

function extractCanonical(html) {
  return extractTagAttribute(html, /<link\b(?=[^>]*rel=["']canonical["'])[^>]*>/i, "href");
}

function extractInternalLinks(html, pageUrl) {
  const links = new Set();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const href = match[1].trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    const url = absoluteUrl(href);
    if (!url) continue;
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    if (parsed.hostname !== base.hostname) continue;
    parsed.hash = "";
    if (parsed.pathname === new URL(pageUrl).pathname && !parsed.search) continue;
    links.add(parsed.toString());
  }
  return [...links];
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

function hasRoot(xml, rootName) {
  return new RegExp(`<${rootName}\\b[\\s\\S]*</${rootName}>`, "i").test(xml);
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "TennisTipz SEO Validator/1.0",
      accept: "text/html,application/xml,text/xml,*/*",
      ...init.headers,
    },
    ...init,
  });
  const body = await response.text();
  return { response, body };
}

async function statusCheck(url) {
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": "TennisTipz SEO Validator/1.0" },
    });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "user-agent": "TennisTipz SEO Validator/1.0" },
      });
    }
    return { url, ok: response.status >= 200 && response.status < 300, status: response.status };
  } catch (error) {
    return { url, ok: false, status: "ERROR", error: errorDetails(error) };
  }
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function expectedCanonical(url) {
  const parsed = new URL(url);
  parsed.protocol = "https:";
  parsed.hostname = new URL(baseUrl).hostname;
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

async function main() {
  const sitemapIndexUrl = `${baseUrl}/sitemap.xml`;
  const robotsUrl = `${baseUrl}/robots.txt`;

  let sitemapIndex;
  try {
    sitemapIndex = await fetchText(sitemapIndexUrl);
  } catch (error) {
    addCheck("sitemap index fetch", false, errorDetails(error));
    printReport();
    process.exit(1);
  }

  const indexContentType = sitemapIndex.response.headers.get("content-type") || "";
  const indexLocs = extractLocs(sitemapIndex.body);
  addCheck("sitemap index returns 200", sitemapIndex.response.status === 200, `${sitemapIndexUrl} -> ${sitemapIndex.response.status}`);
  addCheck("sitemap index is XML, not HTML", !isHtmlBody(sitemapIndex.body) && /xml/i.test(indexContentType), `content-type: ${indexContentType || "missing"}`);
  addCheck("sitemap index validity", hasRoot(sitemapIndex.body, "sitemapindex") && indexLocs.length > 0, `${indexLocs.length} child sitemap(s) found`);

  const childSitemaps = indexLocs.map(absoluteUrl).filter(Boolean);
  const childResults = await mapLimit(childSitemaps, concurrency, async (url) => {
    try {
      const result = await fetchText(url);
      const contentType = result.response.headers.get("content-type") || "";
      const locs = extractLocs(result.body);
      return {
        url,
        status: result.response.status,
        contentType,
        looksHtml: isHtmlBody(result.body),
        isXml: !isHtmlBody(result.body) && /xml/i.test(contentType),
        valid: hasRoot(result.body, "urlset") && locs.length > 0,
        locs,
      };
    } catch (error) {
      return { url, status: "ERROR", contentType: "", looksHtml: false, isXml: false, valid: false, locs: [], error: errorDetails(error) };
    }
  });

  const badChildStatus = childResults.filter((item) => item.status !== 200);
  const badChildXml = childResults.filter((item) => !item.isXml);
  const invalidChildren = childResults.filter((item) => !item.valid);
  addCheck("child sitemap URLs return 200", badChildStatus.length === 0, badChildStatus.map((item) => `${item.url} -> ${item.status}`).join("; ") || `${childResults.length} checked`);
  addCheck("child sitemaps are XML, not HTML", badChildXml.length === 0, badChildXml.map((item) => `${item.url} content-type=${item.contentType || "missing"}`).join("; ") || `${childResults.length} checked`);
  addCheck("child sitemap validity", invalidChildren.length === 0, invalidChildren.map((item) => item.url).join("; ") || `${childResults.length} valid urlset file(s)`);

  const sitemapUrls = [...new Set(childResults.flatMap((item) => item.locs).map(absoluteUrl).filter(Boolean))].slice(0, maxPages);
  const pageStatusResults = await mapLimit(sitemapUrls, concurrency, statusCheck);
  const badPageStatus = pageStatusResults.filter((item) => !item.ok);
  addCheck("all sitemap page URLs return 200", badPageStatus.length === 0, badPageStatus.slice(0, 20).map((item) => `${item.url} -> ${item.status}${item.error ? ` ${item.error}` : ""}`).join("; ") || `${pageStatusResults.length} checked`);

  const pageAudits = await mapLimit(sitemapUrls, concurrency, async (url) => {
    try {
      const { response, body } = await fetchText(url);
      const contentType = response.headers.get("content-type") || "";
      const canonical = extractCanonical(body);
      const title = extractTitle(body);
      const description = extractMeta(body, "description");
      const ogImage = extractMeta(body, "og:image");
      const robots = extractMeta(body, "robots").toLowerCase();
      const internalLinks = response.status === 200 && /html/i.test(contentType) ? extractInternalLinks(body, url) : [];
      return {
        url,
        status: response.status,
        contentType,
        isHtml: isHtmlBody(body) || /html/i.test(contentType),
        canonical,
        canonicalMatches: canonical ? normalizePageUrl(canonical) === expectedCanonical(url) : false,
        title,
        description,
        ogImage,
        noindex: /\bnoindex\b/i.test(robots),
        internalLinks,
      };
    } catch (error) {
      return { url, status: "ERROR", error: errorDetails(error), internalLinks: [] };
    }
  });

  const htmlMistakes = childResults.filter((item) => item.looksHtml);
  addCheck("no sitemap endpoint returns HTML by mistake", htmlMistakes.length === 0, htmlMistakes.map((item) => item.url).join("; ") || "sitemap endpoints checked");

  const missingCanonical = pageAudits.filter((item) => item.isHtml && !item.canonical);
  const badCanonical = pageAudits.filter((item) => item.isHtml && item.canonical && !item.canonicalMatches);
  const missingTitle = pageAudits.filter((item) => item.isHtml && !item.title);
  const missingDescription = pageAudits.filter((item) => item.isHtml && !item.description);
  const missingOgImage = pageAudits.filter((item) => item.isHtml && !item.ogImage);
  const noindexPages = pageAudits.filter((item) => item.noindex);

  addCheck("canonical exists on sitemap pages", missingCanonical.length === 0, missingCanonical.slice(0, 20).map((item) => item.url).join("; ") || "all HTML pages have canonical");
  addCheck("canonical matches page URL", badCanonical.length === 0, badCanonical.slice(0, 20).map((item) => `${item.url} canonical=${item.canonical}`).join("; ") || "all canonical URLs match");
  addCheck("title exists", missingTitle.length === 0, missingTitle.slice(0, 20).map((item) => item.url).join("; ") || "all HTML pages have titles");
  addCheck("meta description exists", missingDescription.length === 0, missingDescription.slice(0, 20).map((item) => item.url).join("; ") || "all HTML pages have descriptions");
  addCheck("OG image exists", missingOgImage.length === 0, missingOgImage.slice(0, 20).map((item) => item.url).join("; ") || "all HTML pages have og:image");
  addCheck("no noindex on sitemap URLs", noindexPages.length === 0, noindexPages.slice(0, 20).map((item) => item.url).join("; ") || "no noindex found");

  let robotsBody = "";
  try {
    const robots = await fetchText(robotsUrl);
    robotsBody = robots.body;
    const robotsSitemaps = [...robotsBody.matchAll(/^sitemap:\s*(.+)$/gim)].map((match) => match[1].trim());
    const hasIndex = robotsSitemaps.some((item) => normalizePageUrl(item) === normalizePageUrl(sitemapIndexUrl));
    addCheck("robots.txt returns 200", robots.response.status === 200, `${robotsUrl} -> ${robots.response.status}`);
    addCheck("robots.txt contains sitemap", hasIndex, robotsSitemaps.join("; ") || "no Sitemap directive found");
  } catch (error) {
    addCheck("robots.txt returns 200", false, errorDetails(error));
    addCheck("robots.txt contains sitemap", false, "robots.txt could not be fetched");
  }

  const internalLinks = [...new Set(pageAudits.flatMap((item) => item.internalLinks || []))].slice(0, maxInternalLinks);
  const internalLinkResults = await mapLimit(internalLinks, concurrency, statusCheck);
  const brokenLinks = internalLinkResults.filter((item) => !item.ok);
  addCheck("broken internal links", brokenLinks.length === 0, brokenLinks.slice(0, 30).map((item) => `${item.url} -> ${item.status}`).join("; ") || `${internalLinkResults.length} checked`);

  printReport({
    baseUrl,
    childSitemaps: childResults.length,
    sitemapPagesChecked: sitemapUrls.length,
    internalLinksChecked: internalLinkResults.length,
    truncatedPages: sitemapUrls.length >= maxPages,
    truncatedLinks: internalLinks.length >= maxInternalLinks,
  });

  if (report.some((item) => !item.passed)) process.exit(1);
}

function printReport(summary = {}) {
  console.log("\nTennisTipz SEO Validation Report");
  console.log("================================");
  if (summary.baseUrl) console.log(`Base URL: ${summary.baseUrl}`);
  if (allowInsecureTls) console.log("TLS: insecure certificate validation disabled for this run");
  if (summary.childSitemaps !== undefined) console.log(`Child sitemaps: ${summary.childSitemaps}`);
  if (summary.sitemapPagesChecked !== undefined) console.log(`Sitemap pages checked: ${summary.sitemapPagesChecked}${summary.truncatedPages ? " (truncated)" : ""}`);
  if (summary.internalLinksChecked !== undefined) console.log(`Internal links checked: ${summary.internalLinksChecked}${summary.truncatedLinks ? " (truncated)" : ""}`);
  console.log("");
  for (const item of report) {
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`);
    if (item.details) console.log(`     ${item.details}`);
  }
}

main().catch((error) => {
  addCheck("validator runtime", false, error.stack || errorDetails(error));
  printReport();
  process.exit(1);
});
