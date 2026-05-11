import { env } from "../config/env.js";
import {
  finishJob,
  getSnapshot,
  saveCardDetail,
  saveSetDetail,
  saveSnapshot,
  startJob,
  upsertSearchCards
} from "../db/repository.js";
import { fetchSourceJson, sourcePaths } from "./mycollectricsClient.js";

interface SetsIndexPayload {
  sets?: Array<Record<string, unknown>>;
}

interface SearchCardsPayload {
  results?: Array<Record<string, unknown>>;
  total?: number;
  count?: number;
  offset?: number;
  limit?: number;
}

export async function refreshCoreData() {
  const jobId = await startJob("refresh:core");
  try {
    await refreshSnapshot("setleaderboard", sourcePaths.setLeaderboard);
    await refreshSnapshot("cardleaderboard", sourcePaths.cardLeaderboard);
    await refreshSnapshot("sealedleaderboard", sourcePaths.sealedLeaderboard);

    const setsIndex = await refreshSnapshot<SetsIndexPayload>("sets", sourcePaths.setsIndex);
    const sets = Array.isArray(setsIndex.sets) ? setsIndex.sets : [];

    for (const row of sets) {
      const code = String(row["set-code"] ?? "");
      if (!code) continue;
      await refreshSetDetail(code);
    }

    await finishJob(jobId, "success", `Refreshed ${sets.length} sets plus leaderboard snapshots.`);
  } catch (error) {
    await finishJob(jobId, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function refreshSearchIndex() {
  const jobId = await startJob("refresh:search");
  try {
    const pageSize = env.SEARCH_PAGE_SIZE;
    const maxPages = env.SEARCH_MAX_PAGES;
    let totalSaved = 0;

    const rarities = await fetchSourceJson(sourcePaths.searchRarities());
    await saveSnapshot("search:rarities", rarities.payload, rarities.sourceUrl);

    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
        sort: "raw_desc"
      });
      const { payload, sourceUrl } = await fetchSourceJson<SearchCardsPayload>(sourcePaths.searchCards(params));
      const rows = payload.results ?? [];
      if (!rows.length) break;

      await upsertSearchCards(rows);
      totalSaved += rows.length;
      await saveSnapshot("search:last-page", payload, sourceUrl);

      if (typeof payload.total === "number" && totalSaved >= payload.total) break;
      if (rows.length < pageSize) break;
    }

    await finishJob(jobId, "success", `Saved ${totalSaved} search cards.`);
  } catch (error) {
    await finishJob(jobId, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function refreshSetDetail(code: string) {
  const { payload, sourceUrl } = await fetchSourceJson(sourcePaths.setDetail(code));
  await saveSetDetail(code, payload, sourceUrl);
  return payload;
}

export async function refreshCardDetail(id: string, includeEbay = true) {
  const { payload, sourceUrl } = await fetchSourceJson(sourcePaths.cardDetail(id, includeEbay));
  await saveCardDetail(id, payload, sourceUrl);
  return payload;
}

export async function refreshCardDetailsFromLeaderboard(limit = 200) {
  const leaderboard = await getSnapshot<{ rows?: Array<Record<string, unknown>> }>("cardleaderboard");
  const rows = leaderboard?.rows ?? [];

  let count = 0;
  for (const row of rows.slice(0, limit)) {
    const id = String(row.id ?? "");
    if (!id) continue;
    await refreshCardDetail(id, true);
    count += 1;
  }
  return count;
}

async function refreshSnapshot<T = unknown>(key: string, path: string) {
  const { payload, sourceUrl } = await fetchSourceJson<T>(path);
  await saveSnapshot(key, payload, sourceUrl);
  return payload;
}
