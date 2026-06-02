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
