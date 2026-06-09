export function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

export function canonicalTournamentSlug(name = "") {
  const raw = slugify(name);
  if (/roland-garros|french-open|france-open/.test(raw)) return "french-open";
  if (/australian-open|aus-open/.test(raw)) return "australian-open";
  if (/us-open|u-s-open|united-states-open/.test(raw)) return "us-open";
  if (/wimbledon/.test(raw)) return "wimbledon";
  return raw;
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTerm(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function isValidCandidate(candidate) {
  return candidate
    && normalizeTerm(candidate.label).length >= 4
    && /^\/(players|tournaments|predictions|articles)\//.test(candidate.url || "")
    && !candidate.url.includes("?")
    && !candidate.url.includes("#");
}

export function dedupeCandidates(candidates = []) {
  const seenUrls = new Set();
  const seenLabels = new Set();
  return candidates
    .filter(isValidCandidate)
    .map((candidate) => ({ ...candidate, label: normalizeTerm(candidate.label) }))
    .sort((a, b) => b.label.length - a.label.length)
    .filter((candidate) => {
      const labelKey = candidate.label.toLowerCase();
      if (seenUrls.has(candidate.url) || seenLabels.has(labelKey)) return false;
      seenUrls.add(candidate.url);
      seenLabels.add(labelKey);
      return true;
    });
}

function linkTextSegment(text, candidates, usedUrls) {
  let output = text;
  for (const candidate of candidates) {
    if (usedUrls.has(candidate.url)) continue;
    const pattern = new RegExp(`(^|[^\\w>])(${escapeRegExp(candidate.label)})(?![^<]*>|[\\w-])`, "i");
    if (!pattern.test(output)) continue;
    output = output.replace(pattern, `${"$1"}<a href="${candidate.url}">${"$2"}</a>`);
    usedUrls.add(candidate.url);
  }
  return output;
}

export function linkArticleBody(bodyHtml = "", candidates = []) {
  const safeCandidates = dedupeCandidates(candidates);
  const usedUrls = new Set();
  const tokens = String(bodyHtml).split(/(<[^>]+>)/g);
  let skipTag = "";
  let insideAnchor = false;

  return tokens.map((token) => {
    if (!token) return token;
    if (token.startsWith("<")) {
      const closing = token.match(/^<\/\s*([a-z0-9]+)/i)?.[1]?.toLowerCase();
      const opening = token.match(/^<\s*([a-z0-9]+)/i)?.[1]?.toLowerCase();
      if (opening === "a") {
        insideAnchor = true;
        const href = token.match(/\shref=["']([^"']+)["']/i)?.[1];
        if (href) usedUrls.add(href);
      }
      if (closing === "a") insideAnchor = false;
      if (opening && /^h[1-6]$/.test(opening)) skipTag = opening;
      if (closing && closing === skipTag) skipTag = "";
      return token;
    }
    if (skipTag || insideAnchor) return token;
    return linkTextSegment(token, safeCandidates, usedUrls);
  }).join("");
}

export function relatedArticleLinks(currentSlug, articles = [], limit = 4) {
  return articles
    .filter((article) => article?.slug && article.slug !== currentSlug && article.title)
    .slice(0, limit)
    .map((article) => ({ label: article.title, url: `/articles/${article.slug}/`, type: "article" }));
}
