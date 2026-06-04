-- Phase 4: 入金管理・源泉徴収・着地見込み の列追加
-- 既存テーブルへの列追加のみ。owner-only RLS は既存ポリシーがそのまま適用される。

-- 入金管理 + 源泉スナップショット（invoices）
alter table invoices
  add column status             text not null default 'unpaid' check (status in ('unpaid','paid')),
  add column paid_date          date,
  add column due_date           date,
  add column withholding_amount numeric not null default 0;

-- 源泉フラグ（contracts）
alter table contracts
  add column withholding boolean not null default false;

-- 源泉率（tax_settings）。100万円の閾値はコード定数（lib/withholding.ts）で保持。
alter table tax_settings
  add column withholding_rate      numeric not null default 0.1021,
  add column withholding_rate_high numeric not null default 0.2042;
