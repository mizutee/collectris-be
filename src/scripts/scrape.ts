import { closePool } from "../db/pool.js";
import { runScrapeJob } from "../jobs/scrapeJob.js";

try {
  await runScrapeJob("script");
} finally {
  await closePool();
}
