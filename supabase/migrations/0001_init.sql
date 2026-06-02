-- =============================================================================
-- ⚠️ SECURITY (必読): このアプリは個人専用（単一ユーザー）。
-- 下の RLS ポリシーは「認証済みユーザー全員」に全データを許可する。
-- これだけだと「サインアップできる第三者」も対象になるため、必ず両方を行うこと:
--   (1) Supabase ダッシュボード → Authentication → Sign In / Providers で
--       "Allow new users to sign up"（公開サインアップ）を OFF にする。
--       自分のアカウントは Authentication → Users から手動で1件だけ作成する。
--   (2) [推奨・多層防御] アカウント作成後、本ファイル末尾の「オーナー限定ハードニング」
--       ブロックを自分の UID で適用し、特定ユーザーのみに絞る。
-- (1) 単独でも実用上は守られるが、(1)+(2) を推奨。
-- =============================================================================

-- clients
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  memo text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- contracts
create table contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  billing_type text not null check (billing_type in ('hourly','monthly_minimum','fixed')),
  minimum_hours numeric,
  base_hourly_rate numeric,
  overtime_hourly_rate numeric,
  fixed_amount numeric,
  start_date date,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- work_logs
create table work_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  work_date date not null,
  planned_hours numeric,
  actual_hours numeric,
  memo text,
  status text not null default 'planned' check (status in ('planned','worked','billed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- expenses
create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  amount numeric not null,
  allocation_rate numeric not null default 1.0,
  allocated_amount numeric generated always as (round(amount * allocation_rate)) stored,
  memo text,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: 認証済みユーザーのみ全操作可（単一ユーザー運用）
alter table clients enable row level security;
alter table contracts enable row level security;
alter table work_logs enable row level security;
alter table expenses enable row level security;

create policy "auth all" on clients   for all to authenticated using (true) with check (true);
create policy "auth all" on contracts for all to authenticated using (true) with check (true);
create policy "auth all" on work_logs for all to authenticated using (true) with check (true);
create policy "auth all" on expenses  for all to authenticated using (true) with check (true);

-- =============================================================================
-- オーナー限定ハードニング（推奨・多層防御）
-- 自分のアカウントを作成後、Authentication → Users で自分の User UID をコピーし、
-- 下の <OWNER_UUID> を置き換えて実行する。これで「特定の1ユーザー」だけに絞れる。
-- （上の "auth all" ポリシーを置き換える）
-- -----------------------------------------------------------------------------
-- drop policy "auth all" on clients;
-- drop policy "auth all" on contracts;
-- drop policy "auth all" on work_logs;
-- drop policy "auth all" on expenses;
--
-- create policy "owner only" on clients   for all to authenticated
--   using (auth.uid() = '<OWNER_UUID>') with check (auth.uid() = '<OWNER_UUID>');
-- create policy "owner only" on contracts for all to authenticated
--   using (auth.uid() = '<OWNER_UUID>') with check (auth.uid() = '<OWNER_UUID>');
-- create policy "owner only" on work_logs for all to authenticated
--   using (auth.uid() = '<OWNER_UUID>') with check (auth.uid() = '<OWNER_UUID>');
-- create policy "owner only" on expenses  for all to authenticated
--   using (auth.uid() = '<OWNER_UUID>') with check (auth.uid() = '<OWNER_UUID>');
-- =============================================================================
