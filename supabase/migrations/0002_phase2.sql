-- profile（発行者情報・単一行）
-- owner_id: 挿入したユーザーのUIDが自動で入り、RLSで本人のみアクセス可能
create table profile (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id),
  display_name  text,
  address       text,
  email         text,
  phone         text,
  bank_info     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- 1ユーザー1行のシングルトン制約
create unique index profile_owner_unique on profile (owner_id);

-- invoices（請求書発行履歴）
create table invoices (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id),
  invoice_no   text not null unique,
  client_id    uuid not null references clients(id),
  year_month   text not null,
  issue_date   date not null,
  total_amount numeric not null,
  memo         text,
  created_at   timestamptz not null default now()
);

-- RLS: オーナー本人のみ（using(true) は使わない）
alter table profile  enable row level security;
alter table invoices enable row level security;
create policy "owner only" on profile  for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner only" on invoices for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- 権限付与（自動公開OFFのため手動でgrant。行アクセスはRLSが制御）
grant select, insert, update, delete on table profile  to authenticated;
grant select, insert, update, delete on table invoices to authenticated;
