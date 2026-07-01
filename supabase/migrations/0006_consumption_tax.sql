-- 消費税（税別契約の上乗せ分）を請求書に保持
-- total_amount は税抜（報酬額）のまま。consumption_tax を別列で持ち、
-- 税込請求額 = total_amount + consumption_tax - withholding_amount で表す。
-- ※ インボイス未登録（免税事業者）でも税別契約なら消費税の請求自体は可能。登録番号はPDFに出さない。
alter table invoices
  add column consumption_tax numeric not null default 0;
