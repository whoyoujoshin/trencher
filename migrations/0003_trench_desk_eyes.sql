alter table trench_desk add column if not exists eyes jsonb not null default '{}'::jsonb;
