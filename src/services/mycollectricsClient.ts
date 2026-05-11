import { env } from "../config/env.js";

export interface SourceResult<T> {
  payload: T;
  sourceUrl: string;
}

export class SourceHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly sourceUrl: string
  ) {
    super(message);
  }
}

export async function fetchSourceJson<T>(path: string, init?: RequestInit): Promise<SourceResult<T>> {
  const sourceUrl = new URL(path, env.SOURCE_BASE_URL).toString();
  const response = await fetch(sourceUrl, {
    ...init,
    headers: {
      accept: "application/json",
      "user-agent": "collectrics-api/0.1 (+internal data refresh)",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new SourceHttpError(`Source request failed with HTTP ${response.status}`, response.status, sourceUrl);
  }

  return {
    payload: (await response.json()) as T,
    sourceUrl
  };
}

export const sourcePaths = {
  setLeaderboard: "/api/leaderboard",
  cardLeaderboard: "/api/card_leaderboard",
  sealedLeaderboard: "/api/sealed_leaderboard",
  setsIndex: "/api/sets_index",
  setDetail: (code: string) => `/api/set/${encodeURIComponent(code.toUpperCase())}`,
  cardDetail: (id: string, includeEbay = true) => `/api/card/${encodeURIComponent(id)}${includeEbay ? "?include=ebay" : ""}`,
  cardEbayListings: (id: string) => `/api/card/${encodeURIComponent(id)}/ebay-listings`,
  searchCards: (params: URLSearchParams) => `/api/search/cards?${params.toString()}`,
  searchRarities: (setCode?: string) => setCode
    ? `/api/search/rarities?setCode=${encodeURIComponent(setCode)}`
    : "/api/search/rarities"
};
