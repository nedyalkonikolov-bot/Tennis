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

For Cloudbet, use the API key generated from your affiliate profile for odds display. Put your actual affiliate click-through URL in `CLOUDBET_AFFILIATE_URL`; the Predictions page uses that URL for the clickable Cloudbet odds button. Keep both Cloudbet values server-side only; the Cloudflare Function calls Cloudbet from `/api/live-data`, so the React frontend never receives the API key.

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
