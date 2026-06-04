-- 振込先を構造化（bank_info 自由テキスト → 5項目）
alter table profile
  add column bank_name      text,
  add column bank_branch    text,
  add column account_type   text,  -- '普通' | '当座'
  add column account_number text,
  add column account_holder text;

-- 旧 bank_info は残す（既存データ参照用）。新規保存は新5項目を使用。
