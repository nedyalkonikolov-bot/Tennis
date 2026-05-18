const SITE_URL = "https://www.tennistipz.win";
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
    .replace(/^-+|-+$/g, "") || "match";
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value) {
  return value === null || value === undefined ? "not enough data" : `${asNumber(value).toFixed(1).replace(/\.0$/, "")}%`;
}

function wl(wins, losses) {
  return `${asNumber(wins)}-${asNumber(losses)}`;
}

function isoDateOrUndefined(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function buildAiPrediction(row) {
  let factors = {};
  try { factors = row.factors_json ? JSON.parse(row.factors_json) : {}; } catch { factors = {}; }
  if (factors.aiSummary) {
    return {
      summary: factors.aiSummary,
      reasons: Array.isArray(factors.aiReasons) ? factors.aiReasons : [],
      strength: "OpenAI analysis",
    };
  }
  const confidence = asNumber(row.confidence, 0);
  const edge = asNumber(row.model_edge, 0);
  const pick = row.predicted_winner_name || "value watch";
  const surface = row.surface || "current surface";
  const strength = confidence >= 78 ? "strong AI lean" : confidence >= 68 ? "positive AI lean" : "measured AI lean";
  const edgeText = `${edge > 0 ? "+" : ""}${edge.toFixed(1)}`;
  const reasons = [
    `${row.player_a_name} is ${row.player_a_rank ? `#${row.player_a_rank}` : "unranked"} with ${wl(row.player_a_recent_wins, row.player_a_recent_losses)} over the last 100 days (${pct(row.player_a_recent_win_rate)}).`,
    `${row.player_b_name} is ${row.player_b_rank ? `#${row.player_b_rank}` : "unranked"} with ${wl(row.player_b_recent_wins, row.player_b_recent_losses)} over the last 100 days (${pct(row.player_b_recent_win_rate)}).`,
    `The 2026 singles season sample is ${asNumber(row.player_a_season_wins) + asNumber(row.player_a_season_losses)} matches for ${row.player_a_name} and ${asNumber(row.player_b_season_wins) + asNumber(row.player_b_season_losses)} matches for ${row.player_b_name}.`,
    `The model edge is ${edgeText} with ${surface} listed as the playing surface.`,
    `The current Cloudbet-linked price recorded for the pick is ${row.predicted_odds || "not available"}.`,
  ];
  const summary = `AI pick: ${pick}. This ${row.tour || "tennis"} prediction is a ${strength} at ${confidence || "pending"}% confidence after combining Cloudbet market price, ranking context, 2026 season record, last-100-days form and the listed ${surface} surface. ${row.player_a_name} enters with a 100-day profile of ${wl(row.player_a_recent_wins, row.player_a_recent_losses)} while ${row.player_b_name} enters with ${wl(row.player_b_recent_wins, row.player_b_recent_losses)}.`;
  return { summary, reasons, strength };
}

async function findMatchBySlug(db, slug) {
  const result = await db.prepare(`
    SELECT
      m.id AS match_id, m.tour, m.tournament, m.start_time, m.status, m.live, m.surface,
      m.player_a_name, m.player_b_name, m.score, m.winner_name,
      pa.current_rank AS player_a_rank, pb.current_rank AS player_b_rank,
      COALESCE(ra.recent_matches, 0) AS player_a_recent_matches,
      COALESCE(ra.recent_wins, 0) AS player_a_recent_wins,
      COALESCE(ra.recent_losses, 0) AS player_a_recent_losses,
      CASE WHEN COALESCE(ra.recent_matches, 0) > 0 THEN ROUND((ra.recent_wins * 1000.0 / ra.recent_matches)) / 10.0 ELSE NULL END AS player_a_recent_win_rate,
      COALESCE(rb.recent_matches, 0) AS player_b_recent_matches,
      COALESCE(rb.recent_wins, 0) AS player_b_recent_wins,
      COALESCE(rb.recent_losses, 0) AS player_b_recent_losses,
      CASE WHEN COALESCE(rb.recent_matches, 0) > 0 THEN ROUND((rb.recent_wins * 1000.0 / rb.recent_matches)) / 10.0 ELSE NULL END AS player_b_recent_win_rate,
      COALESCE(sa.matches_won, 0) AS player_a_season_wins,
      COALESCE(sa.matches_lost, 0) AS player_a_season_losses,
      COALESCE(sb.matches_won, 0) AS player_b_season_wins,
      COALESCE(sb.matches_lost, 0) AS player_b_season_losses,
      p.id AS prediction_id, p.predicted_winner_name, p.predicted_side, p.confidence, p.predicted_odds, p.model_edge,
      p.factors_json,
      po.result_status, po.actual_winner_name, po.correct, po.settled_at
    FROM matches m
    LEFT JOIN players pa ON pa.id = m.player_a_id
    LEFT JOIN players pb ON pb.id = m.player_b_id
    LEFT JOIN (
      SELECT player_id, COUNT(*) AS recent_matches, SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS recent_wins, SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS recent_losses
      FROM player_recent_matches WHERE match_date >= date('now', '-100 days') GROUP BY player_id
    ) ra ON ra.player_id = m.player_a_id
    LEFT JOIN (
      SELECT player_id, COUNT(*) AS recent_matches, SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS recent_wins, SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS recent_losses
      FROM player_recent_matches WHERE match_date >= date('now', '-100 days') GROUP BY player_id
    ) rb ON rb.player_id = m.player_b_id
    LEFT JOIN player_season_stats sa ON sa.player_id = m.player_a_id AND sa.type = 'singles' AND sa.season = '2026'
    LEFT JOIN player_season_stats sb ON sb.player_id = m.player_b_id AND sb.type = 'singles' AND sb.season = '2026'
    LEFT JOIN predictions p ON p.match_id = m.id
    LEFT JOIN prediction_outcomes po ON po.prediction_id = p.id
    WHERE m.tour IN ('ATP', 'WTA') AND CAST(COALESCE(p.predicted_odds, '0') AS REAL) >= 1.01
    ORDER BY m.live DESC, p.created_at DESC, m.start_time ASC
    LIMIT 500
  `).all();
  return (result.results || []).find((row) => slugify(`${row.tour} ${row.player_a_name} vs ${row.player_b_name}`) === slug);
}

function html(match, slug) {
  const title = `${match.player_a_name} vs ${match.player_b_name}`;
  const canonical = `${SITE_URL}/predictions/${slug}/`;
  const ai = buildAiPrediction(match);
  const startDate = isoDateOrUndefined(match.start_time);
  const description = `${title} prediction: ${match.predicted_winner_name || "AI pick"}, ${match.confidence || "model"}% confidence, ${match.surface || "tennis"} surface, Cloudbet odds ${match.predicted_odds || "available"}.`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: title,
    url: canonical,
    sport: "Tennis",
    startDate,
    eventStatus: match.live ? "https://schema.org/EventInProgress" : "https://schema.org/EventScheduled",
    competitor: [{ "@type": "Person", name: match.player_a_name }, { "@type": "Person", name: match.player_b_name }],
    location: { "@type": "Place", name: match.tournament || "Tennis tournament" },
  };
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${title} Prediction`,
    description,
    dateModified: new Date().toISOString(),
    author: { "@type": "Organization", name: "TennisTipz" },
    publisher: { "@type": "Organization", name: "TennisTipz" },
    mainEntityOfPage: canonical,
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} Prediction | ${escapeHtml(match.tour)} Tennis Betting Tips</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${escapeHtml(title)} Prediction">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${SITE_URL}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
<style>body{margin:0;background:#07111f;color:#e5edf7;font-family:Arial,sans-serif;line-height:1.6}.wrap{max-width:1040px;margin:auto;padding:32px 18px}.crumb,.muted{color:#94a3b8}a{color:#bef264}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.card{background:#111c2d;border:1px solid rgba(255,255,255,.1);padding:18px}.pill{display:inline-block;background:#bef264;color:#08111f;font-weight:700;padding:6px 10px}.cta{display:inline-block;margin-top:16px;background:#bef264;color:#08111f;padding:12px 16px;font-weight:700;text-decoration:none}h1{font-size:clamp(34px,6vw,62px);line-height:1.05}h2{margin-top:34px}</style>
</head><body><main class="wrap">
<p class="crumb"><a href="/tennis-predictions/">Tennis predictions</a> / ${escapeHtml(match.tour)}</p>
<span class="pill">${escapeHtml(match.live ? "Live" : match.status || "Upcoming")}</span>
<h1>${escapeHtml(title)} Prediction</h1>
<p class="muted">${escapeHtml(match.tournament || "Tennis")} · ${escapeHtml(match.start_time || "Upcoming")} · ${escapeHtml(match.surface || "Surface TBC")}</p>
<div class="grid">
  <div class="card"><strong>AI Pick</strong><br>${escapeHtml(match.predicted_winner_name || "Pending")}</div>
  <div class="card"><strong>Confidence</strong><br>${escapeHtml(match.confidence ? `${match.confidence}%` : "Pending")}</div>
  <div class="card"><strong>Cloudbet Odds</strong><br>${escapeHtml(match.predicted_odds || "Available soon")}</div>
  <div class="card"><strong>Result</strong><br>${escapeHtml(match.result_status || "pending")}</div>
</div>
<h2>AI Prediction Analysis</h2>
<p>${escapeHtml(ai.summary)}</p>
<div class="grid">${ai.reasons.map((reason) => `<div class="card">${escapeHtml(reason)}</div>`).join("")}</div>
<h2>Player Form</h2>
<div class="grid">
  <div class="card"><strong>${escapeHtml(match.player_a_name)} 100-day form</strong><br>${escapeHtml(wl(match.player_a_recent_wins, match.player_a_recent_losses))} (${escapeHtml(pct(match.player_a_recent_win_rate))})<br>2026: ${escapeHtml(wl(match.player_a_season_wins, match.player_a_season_losses))}</div>
  <div class="card"><strong>${escapeHtml(match.player_b_name)} 100-day form</strong><br>${escapeHtml(wl(match.player_b_recent_wins, match.player_b_recent_losses))} (${escapeHtml(pct(match.player_b_recent_win_rate))})<br>2026: ${escapeHtml(wl(match.player_b_season_wins, match.player_b_season_losses))}</div>
</div>
<p class="muted">18+ Bet responsibly. This is prediction research, not a guaranteed outcome.</p>
<a class="cta" href="${CLOUDBET_URL}" rel="sponsored nofollow">Open Cloudbet tennis odds</a>
<p><a href="/tennis-predictions/">More tennis predictions today</a> · <a href="/atp-predictions/">ATP predictions</a> · <a href="/wta-predictions/">WTA predictions</a></p>
</main></body></html>`;
}

export async function onRequestGet({ params, env }) {
  if (!env.TENNIS_DB) return new Response("Missing database", { status: 500 });
  const slug = params.slug;
  const match = await findMatchBySlug(env.TENNIS_DB, slug);
  if (!match) return new Response("Prediction not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(html(match, slug), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=1800",
    },
  });
}
