import { Router } from "express";
import { runScrapeJob } from "../jobs/scrapeJob.js";
import { refreshCoreData, refreshSearchIndex } from "../services/ingestService.js";

export const adminRoutes = Router();

adminRoutes.post("/refresh/core", async (_req, res) => {
  await refreshCoreData();
  res.json({ ok: true, job: "refresh:core" });
});

adminRoutes.post("/refresh/search", async (_req, res) => {
  await refreshSearchIndex();
  res.json({ ok: true, job: "refresh:search" });
});

adminRoutes.post("/refresh/all", async (_req, res) => {
  await refreshCoreData();
  await refreshSearchIndex();
  res.json({ ok: true, job: "refresh:all" });
});

adminRoutes.post("/scrape", async (_req, res) => {
  const result = await runScrapeJob("admin");
  res.json({ ok: true, job: "scrape", ...result });
});
