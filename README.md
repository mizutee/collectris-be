# collectrics-api

Standalone Express/Postgres backend for Collectrics.

This service is designed as an owned-data backend, not a request gateway:

1. Refresh jobs fetch public data from `mycollectrics.com`.
2. The data is stored in Postgres.
3. Public API routes read from Postgres.

## Endpoints

Frontend-compatible endpoints:

- `GET /health`
- `GET /setleaderboard`
- `GET /cardleaderboard`
- `GET /sealedleaderboard`
- `GET /sets`
- `GET /sets/:code`
- `GET /card/:id?include=ebay`
- `GET /search?q=&rarity=&sort=&limit=&offset=`
- `POST /calculator`

Admin/refresh endpoints:

- `POST /admin/refresh/core`
- `POST /admin/refresh/search`
- `POST /admin/refresh/all`
- `POST /admin/scrape`

## Local setup

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run migrate
npm run refresh:core
npm run dev
```

`npm run refresh:search` fetches paginated search cards into Postgres. Tune `SEARCH_MAX_PAGES` before running a full import.

## Scraping and cron

Run a scrape once:

```bash
npm run scrape
```

Run the cron worker:

```bash
npm run worker:dev
```

By default the scrape cron is every 6 hours:

```env
SCRAPE_CRON=0 */6 * * *
CRON_TIMEZONE=Asia/Bangkok
```

The API server can also host the cron if `ENABLE_CRON=true`, but the cleaner production shape is one API process and one worker process.

## Notes

- `ALLOW_ON_DEMAND_INGEST=false` keeps routes DB-only. If enabled, missing set/card detail requests will fetch once from the source and persist before returning.
- The schema stores source payloads as JSONB first. That keeps endpoint compatibility while leaving room for later normalization.
