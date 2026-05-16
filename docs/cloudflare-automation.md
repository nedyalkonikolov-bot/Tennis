# Cloudflare automation cron

This worker runs TennisTipz automation inside Cloudflare so it does not depend on a local PC.

## Schedules

- `*/15 * * * *` refreshes `/api/live-data`, which also upserts the current Cloudbet matches and predictions into D1.
- `7 * * * *` posts one prediction to Threads through `/api/automation/promote?platform=threads&limit=1`.
- `23 2 * * *` runs the heavier `/api/db/sync` job for players, recent matches, predictions, and outcomes.

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

## Optional GitHub Actions deploy

If you want GitHub to deploy this Worker automatically, add repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Then add a workflow that runs:

```bash
npx wrangler deploy --config wrangler.automation.toml
```