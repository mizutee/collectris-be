import cron from "node-cron";
import { env } from "../config/env.js";
import {
  refreshCardDetailsFromLeaderboard,
  refreshCardEbayListingsFromLeaderboard,
  refreshCoreData,
  refreshSearchIndex
} from "../services/ingestService.js";

let scrapeRunning = false;

export async function runScrapeJob(reason = "manual") {
  if (scrapeRunning) {
    console.log(`[scrape] skipped ${reason}; previous scrape is still running`);
    return { skipped: true };
  }

  scrapeRunning = true;
  const startedAt = Date.now();
  console.log(`[scrape] started (${reason})`);

  try {
    await refreshCoreData();

    if (env.SCRAPE_INCLUDE_SEARCH) {
      await refreshSearchIndex();
    }

    if (env.CARD_DETAIL_REFRESH_LIMIT > 0) {
      const count = await refreshCardDetailsFromLeaderboard(env.CARD_DETAIL_REFRESH_LIMIT);
      console.log(`[scrape] refreshed ${count} card detail pages`);
    }

    if (env.EBAY_LISTINGS_REFRESH_LIMIT > 0) {
      const count = await refreshCardEbayListingsFromLeaderboard(env.EBAY_LISTINGS_REFRESH_LIMIT);
      console.log(`[scrape] refreshed ${count} card eBay listing pages`);
    }

    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[scrape] finished in ${durationSeconds}s`);
    return { skipped: false };
  } finally {
    scrapeRunning = false;
  }
}

export function scheduleScrapeJob() {
  if (!cron.validate(env.SCRAPE_CRON)) {
    throw new Error(`Invalid SCRAPE_CRON value: ${env.SCRAPE_CRON}`);
  }

  cron.schedule(
    env.SCRAPE_CRON,
    () => {
      runScrapeJob("cron").catch(error => {
        console.error("[scrape] cron run failed", error);
      });
    },
    { timezone: env.CRON_TIMEZONE }
  );

  console.log(`[scrape] scheduled '${env.SCRAPE_CRON}' (${env.CRON_TIMEZONE})`);

  if (env.SCRAPE_ON_START) {
    setTimeout(() => {
      runScrapeJob("startup").catch(error => {
        console.error("[scrape] startup run failed", error);
      });
    }, 1000);
  }
}
