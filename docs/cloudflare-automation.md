# Cloudflare automation cron

This worker runs TennisTipz automation inside Cloudflare so it does not depend on a local PC.

## Schedules

- `*/5 * * * *` scans live Cloudbet sport events against active Polymarket markets and stores each run plus opportunities in D1.
- `*/15 * * * *` refreshes `/api/live-data`, which also upserts the current Cloudbet matches and predictions into D1.
- `0 */2 * * *` runs database maintenance independent from any PC:
  - `/api/live-data?refresh=1`
  - `/api/db/sync-outcomes`
  - `/api/db/cleanup-recent`
  - `/api/db/sync-profiles`
- `0 */6 * * *` posts one authentic Threads update through `/api/automation/promote?platform=threads&mode=human&limit=1` for a cleaner four-posts-per-day cadence.
- `0 6 * * *` runs the OpenAI content autopublishing job.
- `30 6 * * *` runs the Google Search Console + OpenAI SEO sync through `/api/seo/gsc-sync`.

The two-hour maintenance run rotates ATP/WTA profile offsets so the database stays clean and current without exceeding Cloudflare or API-Tennis limits. The heavier recent-match backfill endpoint is intentionally not in the unattended cron because it can exceed Cloudflare CPU limits; outcome settlement still uses stored recent matches and API-Tennis fixture fallbacks.

The GSC SEO sync imports Search Console rows into D1, checks priority URLs with the URL Inspection API, and asks OpenAI to turn real query/page data into actionable SEO opportunities. It does not invent rankings or traffic; if OpenAI is unavailable, it stores deterministic opportunities from the GSC data.

The arbitrage scanner stores historical scan runs in `arbitrage_scan_runs` and the top 100 rows per run in `arbitrage_opportunities`. Use those tables to review missed windows, repeated matches, and edge changes over time before acting on any live price.

The repository also includes `.github/workflows/arbitrage-scan.yml`, which runs the same stored scan every five minutes using `TENNISTIPZ_DATABASE_SYNC_TOKEN`. This keeps collection independent from a local PC and provides a fallback when the Cloudflare Worker cannot be deployed.

## Deploy from any machine once

```bash
npx wrangler deploy --config wrangler.automation.toml
npx wrangler secret put SYNC_TOKEN --config wrangler.automation.toml
```

Set `SYNC_TOKEN` to the same value used by your Pages Functions `SYNC_TOKEN` / `x-sync-token`.

Manual test after deployment:

```bash
curl "https://tennistipz-automation-cron.<your-subdomain>.workers.dev/?task=all" -H "x-sync-token: <SYNC_TOKEN>"
```

Manual live arbitrage scan and stored-results checks:

```bash
curl "https://tennistipz-automation-cron.<your-subdomain>.workers.dev/?task=arbitrage-live-scan" -H "x-sync-token: <SYNC_TOKEN>"
curl "https://www.tennistipz.win/api/members/arbitrage?mode=cross-sport-live&stored=1&token=<SYNC_TOKEN>"
```

Manual two-hour DB maintenance test:

```bash
curl "https://tennistipz-automation-cron.<your-subdomain>.workers.dev/?task=db-maintenance" -H "x-sync-token: <SYNC_TOKEN>"
```

Manual GSC/OpenAI SEO sync test:

```bash
curl "https://tennistipz-automation-cron.<your-subdomain>.workers.dev/?task=gsc-seo-sync" -H "x-sync-token: <SYNC_TOKEN>"
curl "https://www.tennistipz.win/api/seo/gsc-report?token=<SYNC_TOKEN>"
```

## Optional GitHub Actions deploy

If you want GitHub to deploy this Worker automatically, add repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Then add a workflow that runs:

```bash
npx wrangler deploy --config wrangler.automation.toml
```
