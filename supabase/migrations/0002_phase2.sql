-- profile（発行者情報・単一行）
create table profile (
  id            uuid primary key default gen_random_uuid(),
  display_name  text,
  address       text,
  email         text,
  phone         text,
  bank_info     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- invoices（請求書発行履歴）
create table invoices (
  id           uuid primary key default gen_random_uuid(),
  invoice_no   text not null unique,
  client_id    uuid not null references clients(id),
  year_month   text not null,
  issue_date   date not null,
  total_amount numeric not null,
  memo         text,
  created_at   timestamptz not null default now()
);

-- RLS
alter table profile  enable row level security;
alter table invoices enable row level security;
create policy "auth all" on profile  for all to authenticated using (true) with check (true);
create policy "auth all" on invoices for all to authenticated using (true) with check (true);

-- 権限付与（自動公開OFFのため手動でgrant）
grant select, insert, update, delete on table profile  to authenticated;
grant select, insert, update, delete on table invoices to authenticated;

-- ⚠️ オーナー限定ハードニング（Phase 1 と同様に推奨）:
-- drop policy "auth all" on profile;
-- drop policy "auth all" on invoices;
-- create policy "owner only" on profile  for all to authenticated
--   using (auth.uid() = '<OWNER_UUID>'::uuid) with check (auth.uid() = '<OWNER_UUID>'::uuid);
-- create policy "owner only" on invoices for all to authenticated
--   using (auth.uid() = '<OWNER_UUID>'::uuid) with check (auth.uid() = '<OWNER_UUID>'::uuid);
