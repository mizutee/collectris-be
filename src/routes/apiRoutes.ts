import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  countCardLeaderboardRows,
  getCardDetailRecord,
  getCardLeaderboardRarities,
  getCardsBySet,
  getSearchRarities,
  getSetDetail,
  getSnapshot,
  getSnapshotRecord,
  searchCardLeaderboardRows,
  searchCards
} from "../db/repository.js";
import { calculateRip, type CalculatorSetData } from "../services/calculator.js";
import {
  cardEbayListingsCacheKey,
  refreshCardDetail,
  refreshCardEbayListings,
  refreshSetDetail
} from "../services/ingestService.js";

export const apiRoutes = Router();

const ebayListingsCacheTtlMs = 6 * 60 * 60 * 1000;
const cardDetailFallbackTtlMs = 6 * 60 * 60 * 1000;

apiRoutes.get("/health", (_req, res) => {
  res.json({ ok: true, service: "collectrics-api" });
});

apiRoutes.get("/setleaderboard", async (_req, res) => {
  res.json(await requireSnapshot("setleaderboard"));
});

apiRoutes.get("/cardleaderboard", async (req, res) => {
  if (!Object.keys(req.query).length) {
    const snapshot = await requireSnapshot<CardLeaderboardSnapshot>("cardleaderboard");
    res.json(snapshot);
    return;
  }

  const parsed = cardLeaderboardQuerySchema.parse(req.query);

  if (await countCardLeaderboardRows()) {
    const [cards, rarities] = await Promise.all([
      searchCardLeaderboardRows(parsed),
      getCardLeaderboardRarities()
    ]);

    res.json({
      data: {
        rows: cards.results,
        count: cards.results.length,
        total: cards.total,
        limit: parsed.limit,
        offset: parsed.offset,
        view: parsed.view,
        rarities
      }
    });
    return;
  }

  const snapshot = await requireSnapshot<CardLeaderboardSnapshot>("cardleaderboard");
  const rows = getCardLeaderboardRows(snapshot);
  const rankField = cardLeaderboardRankFields[parsed.view];
  const q = parsed.q.trim().toLowerCase();

  const filtered = rows
    .filter(row => hasRank(row, rankField))
    .filter(row => {
      if (parsed.rarity && stringValue(row, "rarity-name") !== parsed.rarity) return false;
      if (!q) return true;

      return [
        stringValue(row, "product-name"),
        stringValue(row, "set-name"),
        stringValue(row, "set-code")
      ].some(value => value.toLowerCase().includes(q));
    })
    .sort((a, b) => rankValue(a, rankField) - rankValue(b, rankField));

  const pageRows = filtered.slice(parsed.offset, parsed.offset + parsed.limit);
  const rarities = Array.from(new Set(rows.map(row => stringValue(row, "rarity-name")).filter(Boolean))).sort();

  res.json({
    data: {
      rows: pageRows,
      count: pageRows.length,
      total: filtered.length,
      limit: parsed.limit,
      offset: parsed.offset,
      view: parsed.view,
      rarities
    }
  });
});

apiRoutes.get("/sealedleaderboard", async (_req, res) => {
  res.json(await requireSnapshot("sealedleaderboard"));
});

apiRoutes.get("/sets", async (_req, res) => {
  res.json(await requireSnapshot("sets"));
});

apiRoutes.get("/sets/:code", async (req, res) => {
  let set = await getSetDetail<CalculatorSetData>(req.params.code);
  if (!set && env.ALLOW_ON_DEMAND_INGEST) {
    set = await refreshSetDetail(req.params.code) as CalculatorSetData;
  }
  if (!set) {
    res.status(404).json({ error: "set_not_found" });
    return;
  }

  const rarityBreakdown = set["rarity-breakdown"];
  const rarities = Array.isArray(rarityBreakdown)
    ? rarityBreakdown.map(row => row["rarity-name"] ?? row["rarity-code"]).filter(Boolean)
    : Object.values(rarityBreakdown ?? {}).map(row => row["rarity-name"] ?? row["rarity-code"]).filter(Boolean);
  const cards = await getCardsBySet(req.params.code);

  res.json({
    data: {
      set,
      rarities,
      cards: {
        count: cards.length,
        total: cards.length,
        results: cards
      }
    }
  });
});

apiRoutes.get("/card/:id", async (req, res) => {
  const cached = await getCardDetailRecord<CardDetailPayload>(req.params.id);
  const leaderboard = await getSnapshot<CardLeaderboardSnapshot>("cardleaderboard");
  let card = cached?.payload ?? null;
  let cacheStatus = cached ? "HIT" : "MISS";

  if (env.ALLOW_ON_DEMAND_INGEST && isCardDetailStale(req.params.id, cached, leaderboard)) {
    try {
      card = await refreshCardDetail(req.params.id, req.query.include === "ebay") as CardDetailPayload;
      cacheStatus = cached ? "REFRESHED" : "MISS";
    } catch (error) {
      if (!card) throw error;
      cacheStatus = "STALE";
      console.error(`Failed to refresh stale card detail for ${req.params.id}`, error);
    }
  }

  if (!card) {
    res.status(404).json({ error: "card_not_found" });
    return;
  }

  res.set("x-card-cache", cacheStatus);
  res.json({ data: card });
});

apiRoutes.get("/card/:id/ebay-listings", async (req, res) => {
  const cacheKey = cardEbayListingsCacheKey(req.params.id);
  const cached = await getSnapshotRecord(cacheKey);

  if (cached && Date.now() - cached.fetchedAt.getTime() < ebayListingsCacheTtlMs) {
    res.set("x-cache", "HIT");
    res.json(cached.payload);
    return;
  }

  if (cached) {
    res.set("x-cache", "STALE");
    res.json(cached.payload);
    refreshCardEbayListings(req.params.id).catch(error => {
      console.error(`Failed to refresh eBay listings for card ${req.params.id}`, error);
    });
    return;
  }

  const payload = await refreshCardEbayListings(req.params.id);
  res.set("x-cache", "MISS");
  res.json(payload);
});

apiRoutes.get("/search", async (req, res) => {
  const parsed = searchQuerySchema.parse(req.query);
  const cards = await searchCards(parsed);
  const rarities = await getSearchRarities(parsed.setCode);

  res.json({
    cards: {
      count: cards.results.length,
      total: cards.total,
      results: cards.results
    },
    rarities: {
      setCode: parsed.setCode ?? "",
      rarities
    }
  });
});

apiRoutes.post("/calculator", async (req, res) => {
  const input = calculatorSchema.parse(req.body);
  let set = await getSetDetail<CalculatorSetData>(input.setCode);
  if (!set && env.ALLOW_ON_DEMAND_INGEST) {
    set = await refreshSetDetail(input.setCode) as CalculatorSetData;
  }
  if (!set) {
    res.status(404).json({ error: "set_not_found" });
    return;
  }

  res.json({
    data: calculateRip({
      setData: set,
      packs: input.packs,
      costPerPack: input.costPerPack,
      simulate: input.simulate
    })
  });
});

const searchQuerySchema = z.object({
  q: z.string().optional().default(""),
  rarity: z.string().optional().default(""),
  setCode: z.string().optional(),
  sort: z.string().optional().default("raw_desc"),
  limit: z.coerce.number().int().positive().max(250).default(24),
  offset: z.coerce.number().int().nonnegative().default(0)
});

const cardLeaderboardQuerySchema = z.object({
  view: z.enum(["market", "movement", "grading"]).default("market"),
  q: z.string().optional().default(""),
  rarity: z.string().optional().default(""),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0)
});

type CardLeaderboardView = z.infer<typeof cardLeaderboardQuerySchema>["view"];
type CardLeaderboardRow = Record<string, unknown>;
type CardDetailPayload = Record<string, unknown>;
type CardDetailRecord = {
  payload: CardDetailPayload;
  sourceUrl: string;
  fetchedAt: Date;
};

interface CardLeaderboardSnapshot {
  rows?: CardLeaderboardRow[];
  data?: {
    rows?: CardLeaderboardRow[];
  };
}

const cardLeaderboardRankFields: Record<CardLeaderboardView, string> = {
  market: "rank-supply-saturation-index",
  movement: "rank-dod-change",
  grading: "rank-psa-10-vs-raw"
};

const calculatorSchema = z.object({
  setCode: z.string().min(1),
  packs: z.coerce.number().nonnegative().default(36),
  costPerPack: z.coerce.number().nonnegative().default(0),
  simulate: z.coerce.boolean().default(true)
});

async function requireSnapshot<T = unknown>(key: string): Promise<T> {
  const payload = await getSnapshot(key);
  if (!payload) {
    const error = new Error(`Snapshot '${key}' is empty. Run npm run refresh:core first.`);
    error.name = "SnapshotMissingError";
    throw error;
  }
  return payload as T;
}

function getCardLeaderboardRows(snapshot: CardLeaderboardSnapshot) {
  if (Array.isArray(snapshot.rows)) return snapshot.rows;
  if (Array.isArray(snapshot.data?.rows)) return snapshot.data.rows;
  return [];
}

function stringValue(row: CardLeaderboardRow, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : String(value ?? "");
}

function rankValue(row: CardLeaderboardRow, key: string) {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function hasRank(row: CardLeaderboardRow, key: string) {
  const value = Number(row[key]);
  return Number.isFinite(value) && value > 0;
}

function isCardDetailStale(cardId: string, cached: CardDetailRecord | null, leaderboard: CardLeaderboardSnapshot | null) {
  if (!cached) return true;

  const detailDate = getCardDetailPriceDate(cached.payload);
  const leaderboardDate = getLeaderboardCardSnapshotDate(cardId, leaderboard);
  if (detailDate && leaderboardDate && toUtcDay(leaderboardDate) > toUtcDay(detailDate)) {
    return true;
  }

  return Date.now() - cached.fetchedAt.getTime() > cardDetailFallbackTtlMs;
}

function getCardDetailPriceDate(card: CardDetailPayload) {
  const meta = card._meta;
  if (isRecord(meta)) {
    const syncDate = stringOrNull(meta["published-pricing-sync-date"]);
    if (syncDate) return syncDate;
  }

  const collectricsHistory = card["history-collectrics"];
  if (!Array.isArray(collectricsHistory) || !collectricsHistory.length) return null;

  for (let index = collectricsHistory.length - 1; index >= 0; index -= 1) {
    const row = collectricsHistory[index];
    if (!isRecord(row)) continue;
    const date = stringOrNull(row.date);
    if (date) return date;
  }

  return null;
}

function getLeaderboardCardSnapshotDate(cardId: string, leaderboard: CardLeaderboardSnapshot | null) {
  if (!leaderboard) return null;
  const row = getCardLeaderboardRows(leaderboard).find(candidate => stringValue(candidate, "id") === cardId);
  return row ? stringOrNull(row["snapshot-date"]) : null;
}

function toUtcDay(date: string) {
  const parsed = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
