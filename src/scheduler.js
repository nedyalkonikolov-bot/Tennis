const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_POSTS_PER_DAY = 6;
const DEFAULT_MAX_LINK_POSTS_PER_DAY = 1;
const DEFAULT_MIN_INTERVAL_MINUTES = 90;

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasLink(text) {
  return /https?:\/\//i.test(text) || String(text || "").toLowerCase().includes("tennistipz.win/");
}

function tokenOverlap(left, right) {
  const leftTokens = new Set(normalizeText(left).split(" ").filter((token) => token.length > 3));
  const rightTokens = normalizeText(right).split(" ").filter((token) => token.length > 3);
  if (!leftTokens.size || !rightTokens.length) return 0;
  const shared = rightTokens.filter((token) => leftTokens.has(token)).length;
  return shared / Math.max(leftTokens.size, rightTokens.length);
}

export function checkPostingRules({
  posts = [],
  text,
  now = new Date(),
  maxPostsPerDay = DEFAULT_MAX_POSTS_PER_DAY,
  maxLinkPostsPerDay = DEFAULT_MAX_LINK_POSTS_PER_DAY,
  minIntervalMinutes = DEFAULT_MIN_INTERVAL_MINUTES,
}) {
  const nowTime = now.getTime();
  const publishedPosts = posts.filter((post) => post.publishResult?.ok === true);
  const lastDay = publishedPosts.filter((post) => nowTime - Date.parse(post.timestamp) < DAY_MS);
  const lastPost = [...publishedPosts].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
  const reasons = [];

  if (lastDay.length >= maxPostsPerDay) reasons.push(`Daily limit reached (${maxPostsPerDay}).`);

  const linkPostsToday = lastDay.filter((post) => hasLink(post.selectedPost || post.text || ""));
  if (hasLink(text) && linkPostsToday.length >= maxLinkPostsPerDay) {
    reasons.push(`Daily link-post limit reached (${maxLinkPostsPerDay}).`);
  }

  if (lastPost) {
    const minutesSinceLastPost = (nowTime - Date.parse(lastPost.timestamp)) / 60000;
    if (minutesSinceLastPost < minIntervalMinutes) {
      reasons.push(`Last post was ${Math.round(minutesSinceLastPost)} minutes ago; minimum is ${minIntervalMinutes}.`);
    }
  }

  const duplicate = publishedPosts.find((post) => tokenOverlap(text, post.selectedPost || post.text || "") >= 0.72);
  if (duplicate) reasons.push("Similar wording was already posted.");

  return {
    ok: reasons.length === 0,
    reasons,
  };
}
