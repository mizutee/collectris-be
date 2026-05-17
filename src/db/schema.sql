create table if not exists api_snapshots (
  key text primary key,
  payload jsonb not null,
  source_url text not null,
  fetched_at timestamptz not null default now()
);

create table if not exists set_details (
  set_code text primary key,
  set_name text,
  payload jsonb not null,
  source_url text not null,
  fetched_at timestamptz not null default now()
);

create table if not exists card_details (
  card_id text primary key,
  payload jsonb not null,
  source_url text not null,
  fetched_at timestamptz not null default now()
);

create table if not exists search_cards (
  id text primary key,
  product_name text,
  set_name text,
  set_code text,
  rarity_name text,
  rarity_code text,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists search_cards_product_name_idx on search_cards using gin (to_tsvector('simple', coalesce(product_name, '')));
create index if not exists search_cards_set_code_idx on search_cards (set_code);
create index if not exists search_cards_rarity_name_idx on search_cards (rarity_name);

create extension if not exists pg_trgm;

create table if not exists card_leaderboard_rows (
  id text primary key,
  product_name text,
  set_name text,
  set_code text,
  rarity_name text,
  rank_supply_saturation_index integer,
  rank_dod_change integer,
  rank_psa_10_vs_raw integer,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists card_leaderboard_supply_rank_idx
  on card_leaderboard_rows (rank_supply_saturation_index)
  where rank_supply_saturation_index is not null;
create index if not exists card_leaderboard_dod_rank_idx
  on card_leaderboard_rows (rank_dod_change)
  where rank_dod_change is not null;
create index if not exists card_leaderboard_psa_rank_idx
  on card_leaderboard_rows (rank_psa_10_vs_raw)
  where rank_psa_10_vs_raw is not null;
create index if not exists card_leaderboard_rarity_name_idx on card_leaderboard_rows (rarity_name);
create index if not exists card_leaderboard_set_code_idx on card_leaderboard_rows (set_code);
create index if not exists card_leaderboard_product_name_trgm_idx
  on card_leaderboard_rows using gin (lower(product_name) gin_trgm_ops);
create index if not exists card_leaderboard_set_name_trgm_idx
  on card_leaderboard_rows using gin (lower(set_name) gin_trgm_ops);
create index if not exists card_leaderboard_set_code_trgm_idx
  on card_leaderboard_rows using gin (lower(set_code) gin_trgm_ops);

create table if not exists job_runs (
  id bigserial primary key,
  job_name text not null,
  status text not null,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
