function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=900",
    },
  });
}

function asInt(value, fallback = 16, max = 48) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, max));
}

function formatTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Latest";
  return date.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function articleCategory(contentType = "") {
  const type = String(contentType || "").toLowerCase();
  if (type === "match_prediction") return "Prediction Article";
  if (type === "player_analysis") return "Player Analysis";
  if (type === "tournament_preview") return "Tournament Preview";
  if (type === "news_reaction") return "News Reaction";
  return "Articles";
}

export async function onRequestGet({ env, request }) {
  if (!env.TENNIS_DB) return json({ articles: [], source: "missing D1" });

  const url = new URL(request.url);
  const limit = asInt(url.searchParams.get("limit"));

  try {
    const result = await env.TENNIS_DB.prepare(`
      SELECT
        slug,
        title,
        description,
        excerpt,
        source_type,
        content_type,
        published_at,
        updated_at,
        created_at
      FROM seo_articles
      WHERE status = 'published'
      ORDER BY datetime(COALESCE(published_at, updated_at, created_at)) DESC
      LIMIT ?
    `).bind(limit).all();

    const articles = (result.results || []).map((article) => {
      const publishedAt = article.published_at || article.updated_at || article.created_at || "";
      return {
        id: `article:${article.slug}`,
        kind: "article",
        title: article.title,
        category: articleCategory(article.content_type || article.source_type),
        time: formatTime(publishedAt),
        publishedAt,
        summary: article.excerpt || article.description || "TennisTipz original tennis analysis.",
        url: `/articles/${article.slug}/`,
        imageUrl: "/og-image.png",
        source: "TennisTipz",
      };
    });

    return json({ articles, source: "D1 seo_articles" });
  } catch (error) {
    if (String(error.message || "").includes("seo_articles")) return json({ articles: [], source: "seo_articles missing" });
    return json({ articles: [], error: error.message }, 500);
  }
}
