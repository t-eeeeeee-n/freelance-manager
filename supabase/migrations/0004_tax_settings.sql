-- tax_settings（税試算パラメータ・単一行）スペック §4.7
-- owner_id: 挿入したユーザーのUIDが自動で入り、RLSで本人のみアクセス可能
create table tax_settings (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null default auth.uid() references auth.users(id),
  filing_type              text not null default 'blue' check (filing_type in ('blue','white')),
  blue_deduction           numeric not null default 650000,
  basic_deduction_income   numeric not null default 480000,
  basic_deduction_resident numeric not null default 430000,
  national_pension_annual  numeric not null default 204000,
  health_insurance_rate    numeric not null default 0.10,
  health_insurance_fixed   numeric not null default 50000,
  resident_tax_rate        numeric not null default 0.10,
  resident_tax_fixed       numeric not null default 5000,
  other_deductions         numeric not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
-- 1ユーザー1行のシングルトン制約
create unique index tax_settings_owner_unique on tax_settings (owner_id);

-- RLS: オーナー本人のみ
alter table tax_settings enable row level security;
create policy "owner only" on tax_settings for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- 権限付与（自動公開OFFのため手動でgrant。行アクセスはRLSが制御）
grant select, insert, update, delete on table tax_settings to authenticated;
