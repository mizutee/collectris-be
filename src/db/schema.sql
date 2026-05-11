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

create table if not exists job_runs (
  id bigserial primary key,
  job_name text not null,
  status text not null,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
