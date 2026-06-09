# TennisTipz Content Autopublishing

The automated content pipeline publishes generated pages directly to `seo_articles` with `status = "published"` and `published_at` set automatically.

## Environment variables

- `OPENAI_API_KEY`: OpenAI API key used by the generator.
- `OPENAI_MODEL`: model for all generated pages, default `gpt-5.4-mini`.
- `CONTENT_AUTOPUBLISH_ENABLED`: set `true` to publish; set `false` to disable.
- `CONTENT_AUTOPUBLISH_CRON`: daily cron expression used by the automation worker, default `0 6 * * *`.
- `DAILY_MATCH_PREDICTIONS_COUNT`: daily match prediction pages.
- `DAILY_PLAYER_ANALYSIS_COUNT`: daily player analysis pages.
- `DAILY_TOURNAMENT_PREVIEWS_COUNT`: daily tournament preview pages.
- `DAILY_NEWS_REACTIONS_COUNT`: daily tennis news reaction pages.
- `DAILY_EVERGREEN_ARTICLES_COUNT`: daily evergreen SEO pages.

## Manual run

```powershell
curl.exe -X POST "https://tennistipz.win/api/automation/articles" -H "x-sync-token: DB_TOKEN_900522"
```

Dry run without publishing:

```powershell
curl.exe -X POST "https://tennistipz.win/api/automation/articles?dryRun=1&enabled=true" -H "x-sync-token: DB_TOKEN_900522"
```

Run only one generated page:

```powershell
curl.exe -X POST "https://tennistipz.win/api/automation/articles?limit=1&enabled=true" -H "x-sync-token: DB_TOKEN_900522"
```

## Enable or disable

Enable:

```text
CONTENT_AUTOPUBLISH_ENABLED=true
```

Disable:

```text
CONTENT_AUTOPUBLISH_ENABLED=false
```

The endpoint also accepts `?enabled=true` for a manual override during testing.

## Local testing

1. Run the DB migration endpoint after deployment:

```powershell
curl.exe -X POST "https://tennistipz.win/api/db/migrate" -H "x-sync-token: DB_TOKEN_900522"
```

2. Run a dry run:

```powershell
curl.exe -X POST "https://tennistipz.win/api/automation/articles?dryRun=1&enabled=true" -H "x-sync-token: DB_TOKEN_900522"
```

3. Confirm the response includes `published` candidates in dry-run mode and no validation failures.

## Sitemap verification

After a successful non-dry-run publish, open:

```text
https://www.tennistipz.win/dynamic-sitemap.xml
```

The generated article URL should appear as:

```text
https://www.tennistipz.win/articles/{slug}/
```

The article route only serves rows where `status = "published"`, so sitemap inclusion happens only after successful publishing.
