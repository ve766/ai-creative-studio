-- 0001_init.sql
-- Baseline schema for AI Creative Studio cloud projects.
-- Target: plain PostgreSQL 15+ (no vendor-specific extensions except pgcrypto/pgcrypto-like uuid generation).
-- This migration is provider neutral: Supabase / Neon / managed Postgres all accept it as-is.
--
-- NOT YET EXECUTED against a live database in this repository. Docker/psql are not
-- available in the delivery environment, so this file is delivered together with
-- infra/sql/README.md (verification steps) and must be applied before enabling
-- CLOUD_MODE=cloud.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_subject text not null unique,
  email text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- billing (shapes only; no provider is wired up yet)
-- ---------------------------------------------------------------------------

create table if not exists plans (
  id text primary key,
  name text not null,
  price_minor integer not null check (price_minor >= 0),
  currency text not null check (char_length(currency) = 3),
  monthly_credits integer not null default 0 check (monthly_credits >= 0),
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan_id text not null references plans(id),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  provider text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (provider, provider_subscription_id)
);

drop trigger if exists subscriptions_set_updated_at on subscriptions;
create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  idempotency_key text not null unique,
  job_id uuid,
  balance_after integer not null,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx
  on credit_ledger (user_id, created_at desc);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  provider_payment_id text,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null check (char_length(currency) = 3),
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

drop trigger if exists payments_set_updated_at on payments;
create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- templates
-- ---------------------------------------------------------------------------

create table if not exists product_templates (
  id text primary key,
  category text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists template_versions (
  template_id text not null references product_templates(id) on delete cascade,
  version integer not null check (version > 0),
  spec jsonb not null,
  verified boolean not null default false,
  example boolean not null default false,
  published_at timestamptz not null default now(),
  primary key (template_id, version)
);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  mode text not null default '2d' check (mode in ('2d', 'scene', '3d')),
  template_id text not null,
  template_version integer not null check (template_version > 0),
  schema_version integer not null check (schema_version > 0),
  design jsonb not null check (jsonb_typeof(design) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists projects_owner_updated_idx
  on projects (owner_id, updated_at desc)
  where deleted_at is null;

create index if not exists projects_design_idx
  on projects using gin (design jsonb_path_ops);

drop trigger if exists projects_set_updated_at on projects;
create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

create table if not exists project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  schema_version integer not null check (schema_version > 0),
  design jsonb not null check (jsonb_typeof(design) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists project_versions_project_created_idx
  on project_versions (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- assets
-- ---------------------------------------------------------------------------

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  kind text not null check (kind in ('image', 'model', 'export', 'thumbnail')),
  storage_key text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  width integer check (width > 0),
  height integer check (height > 0),
  checksum text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists assets_owner_created_idx
  on assets (owner_id, created_at desc);

create index if not exists assets_project_idx
  on assets (project_id);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

create table if not exists render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_code text,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  idempotency_key text unique,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_code text,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  idempotency_key text unique,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_code text,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  idempotency_key text unique,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists render_jobs_user_created_idx on render_jobs (user_id, created_at desc);
create index if not exists ai_jobs_user_created_idx on ai_jobs (user_id, created_at desc);
create index if not exists export_jobs_user_created_idx on export_jobs (user_id, created_at desc);

create index if not exists render_jobs_pending_idx
  on render_jobs (status) where status in ('queued', 'processing');
create index if not exists ai_jobs_pending_idx
  on ai_jobs (status) where status in ('queued', 'processing');
create index if not exists export_jobs_pending_idx
  on export_jobs (status) where status in ('queued', 'processing');

drop trigger if exists render_jobs_set_updated_at on render_jobs;
create trigger render_jobs_set_updated_at
  before update on render_jobs
  for each row execute function set_updated_at();

drop trigger if exists ai_jobs_set_updated_at on ai_jobs;
create trigger ai_jobs_set_updated_at
  before update on ai_jobs
  for each row execute function set_updated_at();

drop trigger if exists export_jobs_set_updated_at on export_jobs;
create trigger export_jobs_set_updated_at
  before update on export_jobs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- audit
-- ---------------------------------------------------------------------------

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  action text not null,
  subject text,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_created_idx
  on audit_logs (actor_id, created_at desc);

commit;
