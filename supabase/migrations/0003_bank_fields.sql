-- 振込先を構造化（bank_info 自由テキスト → 5項目）
alter table profile
  add column bank_name      text,
  add column bank_branch    text,
  add column account_type   text,  -- '普通' | '当座'
  add column account_number text,
  add column account_holder text;

-- 住所を構造化（郵便番号＋住所）
alter table profile
  add column postal_code text;

-- 旧 bank_info / address(自由記述のまま利用) は残す。新規保存は新項目を使用。
