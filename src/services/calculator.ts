export interface RarityBreakdown {
  "rarity-code"?: string;
  "rarity-name"?: string;
  "card-count"?: number;
  "avg-raw-price"?: number;
  "avg-psa-10-price"?: number;
  "pull-rate"?: number;
  "pull-rate-pct"?: number;
  "pull-rate-odds"?: string;
  "ev-raw-per-pack"?: number;
  "ev-psa-10-per-pack"?: number;
}

export interface CalculatorSetData {
  "set-code": string;
  "set-name"?: string;
  "ev-raw-per-pack"?: number;
  "avg-pack-cost"?: number | null;
  "avg-gain-loss"?: number | null;
  "rarity-breakdown"?: Record<string, RarityBreakdown> | RarityBreakdown[];
}

export interface CalculatorInput {
  setData: CalculatorSetData;
  packs: number;
  costPerPack: number;
  simulate?: boolean;
}

const rarityOrder = ["MHR", "HR", "SIR", "IR", "UR", "SR", "AR", "RR", "PR", "DR", "ACE", "EX", "FA", "Holo", "Rare", "Uncommon", "Common"];

export function calculateRip(input: CalculatorInput) {
  const packs = Math.max(0, Number(input.packs || 0));
  const simulationPacks = Math.max(0, Math.floor(packs));
  const costPerPack = Math.max(0, Number(input.costPerPack || 0));
  const rarities = toRarityArray(input.setData["rarity-breakdown"]).sort(sortRarities);

  const rows = rarities.map((rarity, index) => {
    const rate = pullRate(rarity);
    const avgRaw = Number(rarity["avg-raw-price"] ?? 0);
    const expectedPulls = packs * rate;
    const expectedValue = expectedPulls * avgRaw;
    const simulatedPulls = input.simulate ? simulateBinomial(simulationPacks, rate) : null;
    const simulatedValue = simulatedPulls == null ? null : simulatedPulls * avgRaw;

    return {
      key: rarityKey(rarity, index),
      rarity,
      pullRate: rate,
      odds: rate > 0 ? `1 / ${Math.round(1 / rate).toLocaleString("en-US")}` : null,
      chancePct: rate * 100,
      expectedPulls,
      expectedValue,
      simulatedPulls,
      simulatedValue
    };
  });

  const expectedTotalValue = rows.reduce((sum, row) => sum + row.expectedValue, 0);
  const totalCost = packs * costPerPack;
  const simulatedTotalValue = rows.reduce((sum, row) => sum + (row.simulatedValue ?? 0), 0);

  return {
    setCode: input.setData["set-code"],
    setName: input.setData["set-name"] ?? input.setData["set-code"],
    packs,
    costPerPack,
    totalCost,
    breakEvenPackCost: input.setData["ev-raw-per-pack"] ?? null,
    marketPackCost: input.setData["avg-pack-cost"] ?? null,
    marketAvgGainLoss: input.setData["avg-gain-loss"] ?? null,
    expected: {
      totalValue: expectedTotalValue,
      gainLoss: expectedTotalValue - totalCost
    },
    simulation: input.simulate
      ? {
          packs: simulationPacks,
          totalValue: simulatedTotalValue,
          gainLoss: simulatedTotalValue - simulationPacks * costPerPack
        }
      : null,
    rows
  };
}

function toRarityArray(value: CalculatorSetData["rarity-breakdown"] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function pullRate(row: RarityBreakdown) {
  const rate = Number(row["pull-rate-pct"] ?? row["pull-rate"] ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

function rarityKey(row: RarityBreakdown, index: number) {
  return row["rarity-code"] || row["rarity-name"] || `rarity-${index}`;
}

function simulateBinomial(trials: number, probability: number) {
  if (!Number.isFinite(probability) || probability <= 0 || trials <= 0) return 0;
  if (probability >= 1) return trials;

  let hits = 0;
  for (let i = 0; i < trials; i += 1) {
    if (Math.random() < probability) hits += 1;
  }
  return hits;
}

function sortRarities(a: RarityBreakdown, b: RarityBreakdown) {
  const left = a["rarity-code"] || a["rarity-name"] || "";
  const right = b["rarity-code"] || b["rarity-name"] || "";
  const leftIndex = rarityOrder.indexOf(left);
  const rightIndex = rarityOrder.indexOf(right);
  if (leftIndex === -1 && rightIndex === -1) return String(left).localeCompare(String(right));
  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  return leftIndex - rightIndex;
}
