create table if not exists trench_desk (
  id text primary key,
  pin_hash text not null,
  blob text not null,
  hunter_id text,
  hunter_until timestamptz,
  updated_at timestamptz not null default now()
);
