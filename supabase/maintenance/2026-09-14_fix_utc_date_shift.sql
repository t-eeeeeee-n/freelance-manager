-- ============================================================
-- UTC基準で「今日」を取っていたバグによる日付ずれの点検・修正
--
-- 原因: new Date().toISOString().slice(0,10) がUTCの日付を返すため、
--       JSTの0:00〜8:59に実行された書き込みが「前日」で記録されていた。
--       （コード側は lib/ym.ts の todayYMD() に統一済み）
--
-- 手順: STEP 1（読み取り）で件数と内容を確認 → STEP 2（更新）を実行。
--       STEP 2 は begin; 〜 commit; の間で件数を必ず確認すること。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 0【読み取りのみ】まずこれ「だけ」を単独で実行する
--   SQL Editorは複数文をまとめて流すと最後の結果しか表示しないため、
--   1回の実行で全件数が分かるサマリーを用意する。
--   総件数が0なら、データではなく権限（RLS/ロール）を疑うこと。
-- ------------------------------------------------------------
select
  (select count(*) from invoices)  as "請求書_総件数",
  (select count(*) from expenses)  as "経費_総件数",
  (select count(*) from invoices
    where issue_date <> (created_at at time zone 'Asia/Tokyo')::date)
                                   as "1A_発行日ずれ_要修正",
  (select count(*) from invoices
    where extract(day  from (created_at at time zone 'Asia/Tokyo')) = 1
      and extract(hour from (created_at at time zone 'Asia/Tokyo')) < 9)
                                   as "1B_対象月の疑い_要目視",
  (select count(*) from invoices where status = 'paid')
                                   as "1C_入金済_要目視",
  (select count(*) from expenses
    where extract(day  from (created_at at time zone 'Asia/Tokyo')) = 1
      and extract(hour from (created_at at time zone 'Asia/Tokyo')) < 9
      and expense_date = (date_trunc('month', (created_at at time zone 'Asia/Tokyo')::date)
                           - interval '1 month')::date)
                                   as "1D_経費の疑い_要目視";

-- ↑ の件数が0でない区分だけ、以下の該当ブロックを「1つずつ」実行して中身を見る。

-- ------------------------------------------------------------
-- STEP 1-A【読み取りのみ】発行日がずれている請求書
--   issue_date はUIから編集できないため、created_at(JST)との不一致は
--   すべてこのバグが原因と判断してよい。
-- ------------------------------------------------------------
select
  invoice_no,
  year_month,
  issue_date                                      as 記録された発行日,
  (created_at at time zone 'Asia/Tokyo')::date    as 正しい発行日,
  due_date                                        as 記録された支払期日,
  (date_trunc('month', (created_at at time zone 'Asia/Tokyo')::date)
     + interval '2 month' - interval '1 day')::date as 正しい支払期日,
  (date_trunc('month', issue_date)
     + interval '2 month' - interval '1 day')::date as 自動計算のままの支払期日,
  to_char(created_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as 発行時刻_JST,
  status,
  paid_date
from invoices
where issue_date <> (created_at at time zone 'Asia/Tokyo')::date
order by created_at;

-- ------------------------------------------------------------
-- STEP 1-B【読み取りのみ】対象月(year_month)が前月になっている疑いのある請求書
--   月初のJST 0〜9時に ?ym 指定なしで発行すると、前月分として発行される。
--   invoice_no にも year_month が埋まるため自動修正はしない。
--   PDFの内容・金額を見て、意図した月かどうか目視で確認すること。
-- ------------------------------------------------------------
select
  invoice_no,
  year_month                                      as 記録された対象月,
  to_char(created_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as 発行時刻_JST,
  total_amount,
  consumption_tax,
  withholding_amount
from invoices
where extract(day  from (created_at at time zone 'Asia/Tokyo')) = 1
  and extract(hour from (created_at at time zone 'Asia/Tokyo')) < 9
order by created_at;

-- ------------------------------------------------------------
-- STEP 1-C【読み取りのみ】入金日の目視確認用
--   invoices には updated_at がないため、「入金済にする」を押した時刻が
--   残っておらず、ずれを自動検出できない。
--   JSTの0〜9時に操作した分は前日で記録されている可能性がある。
--   実際の入金日（通帳・明細）と突き合わせて確認すること。
-- ------------------------------------------------------------
select invoice_no, year_month, issue_date, paid_date, total_amount
from invoices
where status = 'paid'
order by paid_date desc;

-- ------------------------------------------------------------
-- STEP 1-D【読み取りのみ】経費の日付が前月になっている疑い
--   経費フォームの既定値は「表示中の月の1日」。月初のJST 0〜9時に開くと
--   表示中の月が前月になっていたため、既定のまま保存すると前月1日になる。
--   ※ 日付ピッカーで目視・選択できる項目のため、意図した日付の可能性も高い。
-- ------------------------------------------------------------
select
  expense_date, category, amount, allocated_amount, memo,
  to_char(created_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as 登録時刻_JST
from expenses
where extract(day  from (created_at at time zone 'Asia/Tokyo')) = 1
  and extract(hour from (created_at at time zone 'Asia/Tokyo')) < 9
  and expense_date = (date_trunc('month', (created_at at time zone 'Asia/Tokyo')::date)
                       - interval '1 month')::date
order by created_at;

-- ============================================================
-- STEP 2【更新】発行日の修正
--   ※ STEP 1-A の結果を確認してから実行すること。
-- ============================================================
begin;

-- 2-A: 発行日を正しいJSTの日付に戻す
update invoices
set issue_date = (created_at at time zone 'Asia/Tokyo')::date
where issue_date <> (created_at at time zone 'Asia/Tokyo')::date;
-- ここで表示される UPDATE の件数が STEP 1-A の行数と一致することを確認

-- 2-B: 支払期日の修正
--   due_date は請求書一覧で手編集できるため、
--   「自動計算された値のまま（＝手で直していない）」行だけを対象にする。
--   手で設定した支払期日は上書きしない。
update invoices
set due_date = (date_trunc('month', issue_date)
                 + interval '2 month' - interval '1 day')::date
where due_date is not null
  and due_date <> (date_trunc('month', issue_date)
                    + interval '2 month' - interval '1 day')::date
  and due_date = (date_trunc('month', issue_date - interval '1 day')
                    + interval '2 month' - interval '1 day')::date;
-- 条件の最終行 = 「ずれた発行日から自動計算された値」と一致する行のみ

-- 問題なければ commit、やり直すなら rollback
commit;
-- rollback;
