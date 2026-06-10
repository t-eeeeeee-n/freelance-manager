-- Phase 5: 副業モード（給与あり）対応
-- 既存テーブルへの列追加のみ。owner-only RLS は既存ポリシーがそのまま適用される。
-- 既存行は default で 'freelance' になるため後方互換。

alter table tax_settings
  add column employment_type text not null default 'freelance'
    check (employment_type in ('freelance', 'salaried')),
  add column salary_income   numeric not null default 0;
