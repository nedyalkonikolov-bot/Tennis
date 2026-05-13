# TennisTipz database

TennisTipz uses Cloudflare D1 as the real database for player statistics, matches, predictions, and settled prediction outcomes.

## 1. Create the D1 database

```bash
npx wrangler d1 create tennistipz-db
```

## 2. Bind it to Cloudflare Pages

In Cloudflare:

1. Open **Workers & Pages**.
2. Select the TennisTipz Pages project.
3. Go to **Settings > Bindings**.
4. Add a **D1 database** binding.
5. Use variable name: `TENNIS_DB`.
6. Select the D1 database you created.
7. Redeploy the project.

## 3. Apply migrations

From the repo root:

```bash
npx wrangler d1 migrations apply tennistipz-db --remote
```

The first migration creates:

- `players`
- `player_stat_snapshots`
- `matches`
- `predictions`
- `prediction_outcomes`
- `sync_runs`

## 4. Add a sync token

Add a Cloudflare Pages environment variable:

```txt
DATABASE_SYNC_TOKEN=<a long private random string>
```

Do not expose this token in the frontend.

If you want the included GitHub Actions workflow to run daily, add the same value as a GitHub repository secret:

```txt
TENNISTIPZ_DATABASE_SYNC_TOKEN=<same long private random string>
```

## 5. Run a sync

After deployment and binding, call:

```bash
curl -X POST https://tennistipz.win/api/db/sync -H "x-sync-token: YOUR_TOKEN"
```

The sync endpoint:

- pulls current live-data output
- stores top ATP/WTA players
- stores Cloudbet ATP/WTA betting matches
- stores predictions and model factors
- checks recent API-Tennis finished matches and settles prediction outcomes when possible

## 6. Check database status and history

```bash
curl https://tennistipz.win/api/db/summary
curl https://tennistipz.win/api/db/players?tour=ATP&limit=100
curl https://tennistipz.win/api/db/players?tour=WTA&limit=100
curl https://tennistipz.win/api/db/predictions
curl https://tennistipz.win/api/db/predictions?status=settled
```

## 7. Daily automation

The repo includes `.github/workflows/database-sync.yml`, which runs once per day and can also be started manually from GitHub Actions.

Cloudflare Pages Functions do not run scheduled jobs by themselves. Other options are:

- Cloudflare Worker Cron Trigger calling `/api/db/sync`
- external cron service calling `/api/db/sync`

Recommended schedule: once per day for player snapshots, plus optionally every few hours for predictions and outcomes.
