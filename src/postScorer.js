const EMOTIONAL_WORDS = ["feels", "looks", "underrated", "dangerous", "momentum", "nerve", "pressure", "scrappy", "tight", "swing"];
const SPAM_WORDS = ["odds", "bet", "bets", "betting", "stake", "lock", "guaranteed", "sure win", "free pick", "max play"];

function countMatches(text, words) {
  const lower = text.toLowerCase();
  return words.reduce((count, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u");
    return count + (pattern.test(lower) ? 1 : 0);
  }, 0);
}

function hashtagCount(text) {
  return (text.match(/#[\p{L}\p{N}_]+/gu) || []).length;
}

export function scorePost(text) {
  const clean = String(text || "").trim();
  const lower = clean.toLowerCase();
  let score = 0;
  const reasons = [];

  if (clean.includes("?")) {
    score += 18;
    reasons.push("contains a question");
  }
  if (clean.length <= 280) {
    score += 14;
    reasons.push("under 280 characters");
  } else if (clean.length <= 450) {
    score += 5;
    reasons.push("under 450 characters");
  } else {
    score -= 40;
    reasons.push("over 450 characters");
  }

  const emotionHits = countMatches(clean, EMOTIONAL_WORDS);
  if (emotionHits) {
    score += emotionHits * 7;
    reasons.push(`uses ${emotionHits} emotional tennis word(s)`);
  }

  if (/\b(who|what|am i|anyone|agree|disagree|tell me|which)\b/i.test(clean)) {
    score += 8;
    reasons.push("invites replies");
  }

  if (/https?:\/\//i.test(clean) || lower.includes("tennistipz.win/")) {
    score -= 25;
    reasons.push("contains a link");
  }

  const tags = hashtagCount(clean);
  if (tags > 1) {
    score -= tags * 8;
    reasons.push("too many hashtags");
  }

  const spamHits = countMatches(clean, SPAM_WORDS);
  if (spamHits) {
    score -= spamHits * 18;
    reasons.push(`contains ${spamHits} spam/betting word(s)`);
  }

  return { score, reasons };
}

export function selectBestPost(variants) {
  const scored = variants.map((variant) => {
    const result = scorePost(variant.text);
    return { ...variant, ...result };
  });
  scored.sort((left, right) => right.score - left.score);
  return { selected: scored[0], scored };
}
