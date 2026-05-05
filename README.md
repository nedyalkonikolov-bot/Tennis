# TennisTipz

A Vite + React tennis predictions site with live-data-ready pages for match predictions, player stats, and tennis news.

## Live Data

The frontend calls `GET /api/live-data`. On Cloudflare Pages this is handled by `functions/api/live-data.js`, which keeps provider API keys on the server side and returns normalized data for the React app.

### Providers

- Match predictions and player stats: API-Tennis
- News: free RSS feeds from Tennis.com and Google News search

The site falls back to demo data if a provider is missing, rate-limited, or temporarily unavailable.

### Cloudflare Pages Secrets

In Cloudflare, open the Pages project and add this encrypted secret under **Settings > Variables and Secrets**:

```text
API_TENNIS_KEY=your_api_tennis_key
```

No news API key is required. Redeploy after adding or changing secrets. The status bar on the site will show whether tennis and news data are coming from live providers or fallback data.

## Development

```bash
npm install
npm run dev
```

For local testing of the Cloudflare Function, run the app through Wrangler Pages and add local secrets in `.dev.vars`:

```text
API_TENNIS_KEY=your_api_tennis_key
```

`.dev.vars` and `.env` files are ignored by git.

## Build

```bash
npm run build
```
