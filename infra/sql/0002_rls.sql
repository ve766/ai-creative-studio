-- 0002_rls.sql
-- Row Level Security policies. Apply after 0001_init.sql.
--
-- Assumes the managed auth layer exposes `auth.uid()` (Supabase) or an equivalent
-- `app.current_user_id()` set by the API. For plain PostgreSQL, replace
-- `auth.uid()` with `current_setting('app.user_id', true)::uuid`.
--
-- The API server also enforces ownership in code; RLS is defence in depth, not a
-- replacement for server-side authorization checks.

begin;

alter table users enable row level security;
alter table subscriptions enable row level security;
alter table credit_ledger enable row level security;
alter table payments enable row level security;
alter table projects enable row level security;
alter table project_versions enable row level security;
alter table assets enable row level security;
alter table render_jobs enable row level security;
alter table ai_jobs enable row level security;
alter table export_jobs enable row level security;
alter table audit_logs enable row level security;

-- users: a user may read and update only their own row.
drop policy if exists users_select_self on users;
create policy users_select_self on users
  for select using (id = auth.uid());

drop policy if exists users_update_self on users;
create policy users_update_self on users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- subscriptions / credit_ledger / payments: read-only for the owner.
-- Writes happen with the service role only.
drop policy if exists subscriptions_select_own on subscriptions;
create policy subscriptions_select_own on subscriptions
  for select using (user_id = auth.uid());

drop policy if exists credit_ledger_select_own on credit_ledger;
create policy credit_ledger_select_own on credit_ledger
  for select using (user_id = auth.uid());

drop policy if exists payments_select_own on payments;
create policy payments_select_own on payments
  for select using (user_id = auth.uid());

-- projects: full CRUD for the owner, soft-deleted rows stay hidden by default.
drop policy if exists projects_select_own on projects;
create policy projects_select_own on projects
  for select using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists projects_insert_own on projects;
create policy projects_insert_own on projects
  for insert with check (owner_id = auth.uid());

drop policy if exists projects_update_own on projects;
create policy projects_update_own on projects
  for update using (owner_id = auth.uid() and deleted_at is null)
  with check (owner_id = auth.uid());

drop policy if exists projects_delete_own on projects;
create policy projects_delete_own on projects
  for delete using (owner_id = auth.uid());

-- project_versions: owner can read and append, never rewrite history.
drop policy if exists project_versions_select_own on project_versions;
create policy project_versions_select_own on project_versions
  for select using (owner_id = auth.uid());

drop policy if exists project_versions_insert_own on project_versions;
create policy project_versions_insert_own on project_versions
  for insert with check (owner_id = auth.uid());

-- assets: owner can read/insert/update/delete their own rows.
drop policy if exists assets_select_own on assets;
create policy assets_select_own on assets
  for select using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists assets_insert_own on assets;
create policy assets_insert_own on assets
  for insert with check (owner_id = auth.uid());

drop policy if exists assets_update_own on assets;
create policy assets_update_own on assets
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists assets_delete_own on assets;
create policy assets_delete_own on assets
  for delete using (owner_id = auth.uid());

-- jobs: owner can read their jobs. Status transitions are written by the worker
-- with the service role so a client cannot fake a "succeeded" job.
drop policy if exists render_jobs_select_own on render_jobs;
create policy render_jobs_select_own on render_jobs
  for select using (user_id = auth.uid());

drop policy if exists ai_jobs_select_own on ai_jobs;
create policy ai_jobs_select_own on ai_jobs
  for select using (user_id = auth.uid());

drop policy if exists export_jobs_select_own on export_jobs;
create policy export_jobs_select_own on export_jobs
  for select using (user_id = auth.uid());

-- audit_logs: no client access at all (service role only).
drop policy if exists audit_logs_deny_all on audit_logs;
create policy audit_logs_deny_all on audit_logs
  for select using (false);

commit;
