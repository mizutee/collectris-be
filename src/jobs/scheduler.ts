import { env } from "../config/env.js";
import { scheduleScrapeJob } from "./scrapeJob.js";

export function startScheduler() {
  if (!env.ENABLE_CRON) return;
  scheduleScrapeJob();
}
