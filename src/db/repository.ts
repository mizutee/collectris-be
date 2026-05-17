import { pool } from "./pool.js";

export type JsonValue = Record<string, unknown> | unknown[];
export type CardLeaderboardView = "market" | "movement" | "grading";

export async function saveSnapshot(key: string, payload: unknown, sourceUrl: string) {
  await pool.query(
    `
      insert into api_snapshots (key, payload, source_url, fetched_at)
      values ($1, $2::jsonb, $3, now())
      on conflict (key) do update set
        payload = excluded.payload,
        source_url = excluded.source_url,
        fetched_at = excluded.fetched_at
    `,
    [key, JSON.stringify(payload), sourceUrl]
  );
}

export async function getSnapshot<T = unknown>(key: string): Promise<T | null> {
  const result = await pool.query("select payload from api_snapshots where key = $1", [key]);
  return (result.rows[0]?.payload as T | undefined) ?? null;
}

export async function getSnapshotRecord<T = unknown>(key: string): Promise<{
  payload: T;
  sourceUrl: string;
  fetchedAt: Date;
} | null> {
  const result = await pool.query(
    "select payload, source_url, fetched_at from api_snapshots where key = $1",
    [key]
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    payload: row.payload as T,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at
  };
}

export async function upsertCardLeaderboardRows(rows: Record<string, unknown>[]) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("truncate card_leaderboard_rows");

    for (const row of rows) {
      const id = String(row.id ?? "");
      if (!id) continue;

      await client.query(
        `
          insert into card_leaderboard_rows (
            id,
            product_name,
            set_name,
            set_code,
            rarity_name,
            rank_supply_saturation_index,
            rank_dod_change,
            rank_psa_10_vs_raw,
            payload,
            fetched_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
          on conflict (id) do update set
            product_name = excluded.product_name,
            set_name = excluded.set_name,
            set_code = excluded.set_code,
            rarity_name = excluded.rarity_name,
            rank_supply_saturation_index = excluded.rank_supply_saturation_index,
            rank_dod_change = excluded.rank_dod_change,
            rank_psa_10_vs_raw = excluded.rank_psa_10_vs_raw,
            payload = excluded.payload,
            fetched_at = excluded.fetched_at
        `,
        [
          id,
          textValue(row["product-name"]),
          textValue(row["set-name"]),
          textValue(row["set-code"]),
          textValue(row["rarity-name"]),
          intValue(row["rank-supply-saturation-index"]),
          intValue(row["rank-dod-change"]),
          intValue(row["rank-psa-10-vs-raw"]),
          JSON.stringify(row)
        ]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface CardLeaderboardRowsParams {
  view: CardLeaderboardView;
  q?: string;
  rarity?: string;
  limit: number;
  offset: number;
}

export async function searchCardLeaderboardRows(params: CardLeaderboardRowsParams) {
  const clauses: string[] = [`${cardLeaderboardRankColumn(params.view)} is not null`];
  const values: unknown[] = [];

  if (params.q) {
    values.push(`%${params.q.toLowerCase()}%`);
    clauses.push(`(
      lower(product_name) like $${values.length}
      or lower(set_name) like $${values.length}
      or lower(coalesce(set_code, '')) like $${values.length}
    )`);
  }

  if (params.rarity) {
    values.push(params.rarity);
    clauses.push(`rarity_name = $${values.length}`);
  }

  const where = `where ${clauses.join(" and ")}`;
  const rankColumn = cardLeaderboardRankColumn(params.view);

  const totalResult = await pool.query(`select count(*)::int as total from card_leaderboard_rows ${where}`, values);

  values.push(params.limit);
  values.push(params.offset);
  const limitIndex = values.length - 1;
  const offsetIndex = values.length;

  const rowsResult = await pool.query(
    `
      select payload
      from card_leaderboard_rows
      ${where}
      order by ${rankColumn} asc
      limit $${limitIndex}
      offset $${offsetIndex}
    `,
    values
  );

  return {
    total: Number(totalResult.rows[0]?.total ?? 0),
    results: rowsResult.rows.map(row => row.payload)
  };
}

export async function getCardLeaderboardRarities() {
  const result = await pool.query(
    `
      select distinct rarity_name
      from card_leaderboard_rows
      where rarity_name is not null and rarity_name <> ''
      order by rarity_name asc
    `
  );

  return result.rows.map(row => row.rarity_name).filter(Boolean);
}

export async function countCardLeaderboardRows() {
  const result = await pool.query("select count(*)::int as total from card_leaderboard_rows");
  return Number(result.rows[0]?.total ?? 0);
}

export async function saveSetDetail(setCode: string, payload: unknown, sourceUrl: string) {
  const setName = typeof payload === "object" && payload && "set-name" in payload
    ? String((payload as Record<string, unknown>)["set-name"] ?? "")
    : null;

  await pool.query(
    `
      insert into set_details (set_code, set_name, payload, source_url, fetched_at)
      values ($1, $2, $3::jsonb, $4, now())
      on conflict (set_code) do update set
        set_name = excluded.set_name,
        payload = excluded.payload,
        source_url = excluded.source_url,
        fetched_at = excluded.fetched_at
    `,
    [setCode.toUpperCase(), setName, JSON.stringify(payload), sourceUrl]
  );
}

export async function getSetDetail<T = unknown>(setCode: string): Promise<T | null> {
  const result = await pool.query("select payload from set_details where set_code = $1", [setCode.toUpperCase()]);
  return (result.rows[0]?.payload as T | undefined) ?? null;
}

export async function saveCardDetail(cardId: string, payload: unknown, sourceUrl: string) {
  await pool.query(
    `
      insert into card_details (card_id, payload, source_url, fetched_at)
      values ($1, $2::jsonb, $3, now())
      on conflict (card_id) do update set
        payload = excluded.payload,
        source_url = excluded.source_url,
        fetched_at = excluded.fetched_at
    `,
    [cardId, JSON.stringify(payload), sourceUrl]
  );
}

export async function getCardDetail<T = unknown>(cardId: string): Promise<T | null> {
  const result = await pool.query("select payload from card_details where card_id = $1", [cardId]);
  return (result.rows[0]?.payload as T | undefined) ?? null;
}

export async function getCardDetailRecord<T = unknown>(cardId: string): Promise<{
  payload: T;
  sourceUrl: string;
  fetchedAt: Date;
} | null> {
  const result = await pool.query(
    "select payload, source_url, fetched_at from card_details where card_id = $1",
    [cardId]
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    payload: row.payload as T,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at
  };
}

export async function upsertSearchCards(cards: Record<string, unknown>[]) {
  for (const card of cards) {
    const id = String(card.id ?? "");
    if (!id) continue;

    await pool.query(
      `
        insert into search_cards (id, product_name, set_name, set_code, rarity_name, rarity_code, payload, fetched_at)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
        on conflict (id) do update set
          product_name = excluded.product_name,
          set_name = excluded.set_name,
          set_code = excluded.set_code,
          rarity_name = excluded.rarity_name,
          rarity_code = excluded.rarity_code,
          payload = excluded.payload,
          fetched_at = excluded.fetched_at
      `,
      [
        id,
        card["product-name"] ?? null,
        card["set-name"] ?? null,
        card["set-code"] ?? null,
        card["rarity-name"] ?? null,
        card["rarity-code"] ?? null,
        JSON.stringify(card)
      ]
    );
  }
}

export interface SearchCardsParams {
  q?: string;
  rarity?: string;
  setCode?: string;
  sort?: string;
  limit: number;
  offset: number;
}

export async function searchCards(params: SearchCardsParams) {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (params.q) {
    values.push(`%${params.q.toLowerCase()}%`);
    clauses.push(`(lower(product_name) like $${values.length} or lower(set_name) like $${values.length} or lower(coalesce(set_code, '')) like $${values.length})`);
  }

  if (params.rarity) {
    values.push(params.rarity);
    clauses.push(`rarity_name = $${values.length}`);
  }

  if (params.setCode) {
    values.push(params.setCode.toUpperCase());
    clauses.push(`set_code = $${values.length}`);
  }

  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const orderBy = sortClause(params.sort);

  const totalResult = await pool.query(`select count(*)::int as total from search_cards ${where}`, values);

  values.push(params.limit);
  values.push(params.offset);
  const limitIndex = values.length - 1;
  const offsetIndex = values.length;

  const rowsResult = await pool.query(
    `
      select payload
      from search_cards
      ${where}
      ${orderBy}
      limit $${limitIndex}
      offset $${offsetIndex}
    `,
    values
  );

  return {
    total: Number(totalResult.rows[0]?.total ?? 0),
    results: rowsResult.rows.map(row => row.payload)
  };
}

export async function getCardsBySet(setCode: string, limit = 1000) {
  const result = await pool.query(
    `
      select payload
      from search_cards
      where set_code = $1
      order by coalesce((payload->>'collectrics-raw-price')::numeric, (payload->>'raw-price')::numeric, 0) desc
      limit $2
    `,
    [setCode.toUpperCase(), limit]
  );

  return result.rows.map(row => row.payload);
}

export async function getSearchRarities(setCode?: string) {
  const values: unknown[] = [];
  const clauses = ["rarity_name is not null"];
  if (setCode) {
    values.push(setCode.toUpperCase());
    clauses.push(`set_code = $${values.length}`);
  }

  const result = await pool.query(
    `
      select distinct rarity_name
      from search_cards
      where ${clauses.join(" and ")}
      order by rarity_name asc
    `,
    values
  );

  return result.rows.map(row => row.rarity_name).filter(Boolean);
}

export async function startJob(jobName: string) {
  const result = await pool.query(
    "insert into job_runs (job_name, status) values ($1, $2) returning id",
    [jobName, "running"]
  );
  return Number(result.rows[0].id);
}

export async function finishJob(id: number, status: "success" | "failed", message?: string) {
  await pool.query(
    "update job_runs set status = $1, message = $2, finished_at = now() where id = $3",
    [status, message ?? null, id]
  );
}

function sortClause(sort?: string) {
  switch (sort) {
    case "raw_asc":
      return "order by coalesce((payload->>'collectrics-raw-price')::numeric, (payload->>'raw-price')::numeric, 0) asc";
    case "psa10_desc":
      return "order by coalesce((payload->>'psa-10-price')::numeric, 0) desc";
    case "psa10_asc":
      return "order by coalesce((payload->>'psa-10-price')::numeric, 0) asc";
    case "name_asc":
      return "order by product_name asc nulls last";
    case "raw_desc":
    default:
      return "order by coalesce((payload->>'collectrics-raw-price')::numeric, (payload->>'raw-price')::numeric, 0) desc";
  }
}

function cardLeaderboardRankColumn(view: CardLeaderboardView) {
  switch (view) {
    case "movement":
      return "rank_dod_change";
    case "grading":
      return "rank_psa_10_vs_raw";
    case "market":
    default:
      return "rank_supply_saturation_index";
  }
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function intValue(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.trunc(numberValue) : null;
}
