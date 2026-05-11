import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  getCardDetail,
  getCardsBySet,
  getSearchRarities,
  getSetDetail,
  getSnapshot,
  searchCards
} from "../db/repository.js";
import { calculateRip, type CalculatorSetData } from "../services/calculator.js";
import { refreshCardDetail, refreshSetDetail } from "../services/ingestService.js";

export const apiRoutes = Router();

apiRoutes.get("/health", (_req, res) => {
  res.json({ ok: true, service: "collectrics-api" });
});

apiRoutes.get("/setleaderboard", async (_req, res) => {
  res.json(await requireSnapshot("setleaderboard"));
});

apiRoutes.get("/cardleaderboard", async (_req, res) => {
  res.json(await requireSnapshot("cardleaderboard"));
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
  let card = await getCardDetail(req.params.id);
  if (!card && env.ALLOW_ON_DEMAND_INGEST) {
    card = await refreshCardDetail(req.params.id, req.query.include === "ebay");
  }
  if (!card) {
    res.status(404).json({ error: "card_not_found" });
    return;
  }

  res.json({ data: card });
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

const calculatorSchema = z.object({
  setCode: z.string().min(1),
  packs: z.coerce.number().nonnegative().default(36),
  costPerPack: z.coerce.number().nonnegative().default(0),
  simulate: z.coerce.boolean().default(true)
});

async function requireSnapshot(key: string) {
  const payload = await getSnapshot(key);
  if (!payload) {
    const error = new Error(`Snapshot '${key}' is empty. Run npm run refresh:core first.`);
    error.name = "SnapshotMissingError";
    throw error;
  }
  return payload;
}
