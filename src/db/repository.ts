import { pool } from "./pool.js";

export type JsonValue = Record<string, unknown> | unknown[];

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
