import { scheduleScrapeJob } from "./jobs/scrapeJob.js";

console.log("collectrics-api scrape worker starting");
scheduleScrapeJob();
