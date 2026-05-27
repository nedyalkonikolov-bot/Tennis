# TennisTipz

A Vite + React tennis predictions site with live-data-ready pages for match predictions, player stats, and tennis news.

## Live Data

The frontend calls `GET /api/live-data`. On Cloudflare Pages this is handled by `functions/api/live-data.js`, which keeps provider API keys on the server side and returns normalized data for the React app.

### Providers

- Match predictions: API-Tennis recent match data from the last 100 days, enriched with Cloudbet winner odds when available
- Player stats: API-Tennis top 150 ATP and top 150 WTA standings, split by tour
- News: free RSS feed from Tennis.com

The site falls back to demo data if a provider is missing, rate-limited, or temporarily unavailable.

### Cloudflare Pages Secrets

In Cloudflare, open the Pages project and add these encrypted secrets under **Settings > Variables and Secrets**:

```text
API_TENNIS_KEY=your_api_tennis_key
CLOUDBET_API_KEY=your_cloudbet_api_key
CLOUDBET_AFFILIATE_URL=your_cloudbet_affiliate_link
```

No news API key is required. Redeploy after adding or changing secrets. The status bar on the site will show whether tennis, odds, and news data are coming from live providers or fallback data.

For Cloudbet, use the API key generated from your affiliate profile for odds display. Put your actual affiliate click-through URL in `CLOUDBET_AFFILIATE_URL`; the Predictions page uses that URL for the clickable Cloudbet odds button. Keep `CLOUDBET_API_KEY` private on the server side. The affiliate URL is returned to the frontend intentionally as the public outbound click target.

## Development

```bash
npm install
npm run dev
```

For local testing of the Cloudflare Function, run the app through Wrangler Pages and add local secrets in `.dev.vars`:

```text
API_TENNIS_KEY=your_api_tennis_key
CLOUDBET_API_KEY=your_cloudbet_api_key
CLOUDBET_AFFILIATE_URL=your_cloudbet_affiliate_link
```

`.dev.vars` and `.env` files are ignored by git.

## Build

```bash
npm run build
```

## Threads Content Automation

This repo also includes a dry-run-first Threads automation for human-style tennis content. It generates five post variants with the OpenAI Responses API, scores them, applies anti-spam limits, and can publish the best one through the Threads API.

On Cloudflare, the automation worker calls `/api/automation/promote?platform=threads&mode=human&limit=1` every 4 hours. That server-side mode chooses from stored TennisTipz predictions or ESPN tennis news, then creates one discussion-style Threads post. It still enforces max 6 posts/day, max 1 link post/day, minimum 90 minutes between posts, and duplicate wording checks.

The worker deployment is handled by `.github/workflows/deploy-automation-worker.yml`. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub repository secrets so schedule changes deploy from GitHub instead of a local PC.

The worker also calls `/api/automation/articles?limit=1&source=mixed` twice per day. That endpoint creates original SEO articles from ESPN tennis news or stored TennisTipz predictions, saves them in D1, and publishes them at `/articles/<slug>/`. Generated article URLs are included in the dynamic sitemap.

### Install

```bash
npm install
```

### Environment

Create `.env` from `.env.example`:

```text
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-5.4-mini
OPENAI_PREDICTION_MODEL=gpt-5.4-mini
OPENAI_NEWS_MODEL=gpt-5.4-mini
OPENAI_SOCIAL_MODEL=gpt-5.4-mini
OPENAI_PREMIUM_MODEL=gpt-5.4
OPENAI_USE_PREMIUM_PREDICTIONS=false
THREADS_USER_ID=your_threads_user_id
THREADS_ACCESS_TOKEN=your_threads_access_token
LIVE_POSTING=false
POST_STORAGE_PATH=./data/threads-posts.json
MATCH_DATA_PATH=./match-data.json
```

`LIVE_POSTING=false` is the default. In dry-run mode the automation prints and logs the generated post, but does not publish.

Model routing is split by task so the high-volume mini token pool handles normal traffic:

- `OPENAI_PREDICTION_MODEL`: structured match prediction enrichment, default `gpt-5.4-mini`
- `OPENAI_NEWS_MODEL`: RSS headline/card rewriting, default `gpt-5.4-mini`
- `OPENAI_SOCIAL_MODEL`: Threads/social post variants, default `gpt-5.4-mini`
- `OPENAI_USE_PREMIUM_PREDICTIONS=true`: opt in to `OPENAI_PREMIUM_MODEL` for prediction batches only

### Match Input

Put match data in `match-data.json`, or pass it inline with `--match`:

```json
{
  "tournament": "ATP Rome",
  "surface": "clay",
  "player1": "Carlos Alcaraz",
  "player2": "Jannik Sinner",
  "score": "live or upcoming",
  "stats": {
    "break_points": "...",
    "first_serve_percentage": "...",
    "recent_form": "..."
  },
  "prediction": {
    "lean": "Over 22.5 games",
    "confidence": "medium",
    "reason": "Both players hold serve well on clay"
  }
}
```

### Dry Run

```bash
npm run threads:dry-run
```

This logs generated variants, the selected post, score, safety-rule status, timestamp, and match metadata to `data/threads-posts.json`.

### Live Posting

On macOS/Linux:

```bash
LIVE_POSTING=true npm run threads:post
```

On Windows PowerShell:

```powershell
$env:LIVE_POSTING="true"
npm run threads:post
```

The automation will publish only when all safety rules pass:

- max 6 posts per day
- max 1 post with a link per day
- minimum 90 minutes between posts
- no near-duplicate wording

The selected post is sent to Threads by creating a text media container and then publishing that container.
