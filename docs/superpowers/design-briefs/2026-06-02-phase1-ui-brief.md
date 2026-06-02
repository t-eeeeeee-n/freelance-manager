# Phase 1 UI デザインブリーフ（claude design 用）

このドキュメントは **claude design** に渡す「デザイン以外の要件」です。配色・余白・タイポgrafi・コンポーネントの見た目・アニメーションは **claude design が決定**します。ここではビジュアルを指定しません。各画面の目的・データ項目・操作・状態・遷移のみを定義します。

## プロダクト前提（全画面共通）
- **何**: 個人（フリーランス／業務委託）が自分だけで使う、稼働・請求・経費の管理Webアプリ。
- **利用者**: 本人1名のみ（マルチユーザーなし）。日本語UI。通貨は円（整数、3桁区切り表示 `toLocaleString('ja-JP')`）。
- **利用文脈**: 日々の稼働・経費入力（データ入力が多い）＋月末の集計確認。主にPC、たまにスマホ。
- **技術制約**: Next.js 15 App Router / React / Tailwind CSS。データ取得は Server Component、書き込みは Server Actions（`{ error: string | null }` を返す）。フォームは Client Component で `useActionState` などを使用。
- **トーン**: 業務ツール。情報の見やすさ・入力のしやすさ優先（過度な装飾は不要だが、claude design の裁量で品質高く）。
- **レスポンシブ**: PC基準。スマホでも入力・閲覧できること。

## アプリシェル / ナビゲーション（認証後の共通レイアウト）
- 遷移先: ダッシュボード / クライアント / 契約条件 / 稼働ログ / 経費 / 月次サマリー。
- ログアウトボタン（`signOut` Server Action を呼ぶ）。
- 現在地が分かるナビ表現。

---

## 画面1: ログイン（`/login`）
- **目的**: 本人専用1アカウントのログイン。新規登録UIは無し。
- **入力**: email（必須・type=email）、password（必須・type=password）。
- **アクション**: 送信ボタン1つ。`useActionState(signIn, null)` で呼び、`signIn` は失敗時にエラーメッセージ文字列を返す。
- **状態**: 送信中（pending）表示、エラーメッセージ表示領域。
- **遷移**: 成功時はサーバ側で `/dashboard` にリダイレクト。
- input の `name` は `email` / `password` を維持。

## 画面2: ダッシュボード（`/dashboard`）
- **目的**: 当月の要約を一目で。
- **表示**（サーバから集計済みで受領）:
  - 今月の稼働時間（合計・時間）
  - 今月の請求見込み（円）
  - 今月の経費合計（円）
  - クライアント/契約別の稼働状況リスト（契約名・稼働時間・請求額）
- **操作**: 各画面への導線。
- **状態**: データ0件時の空表示。

## 画面3: クライアント一覧・編集（`/clients`）
- **目的**: 業務委託先の一覧・追加・編集・有効/無効切替。
- **データ項目**: name（必須）、memo（任意・複数行）、is_active（有効/無効、トグル表示）。
- **アクション**:
  - 追加フォーム → `createClientRecord(formData)`（`name`,`memo`）
  - 行の編集 → `updateClientRecord(id, formData)`
  - 有効/無効トグル → `setClientActive(id, isActive)`
- **状態/エラー**: 各 action は `{ error }` を返す。エラー表示。無効クライアントは視覚的に区別。
- input の `name`: `name`, `memo`。

## 画面4: 契約条件設定（`/contracts`）
- **目的**: クライアントごとの契約条件の一覧・追加・編集・有効切替。
- **データ項目**:
  - client_id（select・必須／有効クライアントから選択）
  - name（必須）
  - billing_type（select・必須）: `hourly`=時給制 / `monthly_minimum`=月間最低 / `fixed`=固定報酬
  - start_date / end_date（date・任意）
  - **billing_type による出し分け（重要）**:
    - `hourly`: base_hourly_rate（必須）
    - `monthly_minimum`: minimum_hours（必須）・base_hourly_rate（必須）・overtime_hourly_rate（任意）
    - `fixed`: fixed_amount（必須）
- **アクション**: `createContract(formData)` / `updateContract(id, formData)` / `setContractActive(id, isActive)`。
- **バリデーション**: 上記の必須条件。エラー `{ error }` 表示。
- **状態**: 契約に紐づくクライアント名を一覧に表示。
- input の `name`: `client_id`,`name`,`billing_type`,`base_hourly_rate`,`minimum_hours`,`overtime_hourly_rate`,`fixed_amount`,`start_date`,`end_date`。
- billing_type を変えると入力欄が動的に切り替わる Client Component。

## 画面5: 稼働ログ入力（`/work-logs`）
- **目的**: 日々の稼働の登録・編集・削除。1行=1日×1契約。
- **データ項目**:
  - work_date（date・必須）
  - client_id（select・必須）
  - contract_id（select・必須）— **client_id を選ぶと、そのクライアントの有効契約に選択肢を絞る**
  - planned_hours（数値・任意・小数可、単位:時間）
  - actual_hours（数値・任意・小数可、単位:時間）
  - status（select）: `planned` / `worked` / `billed`
  - memo（任意）
- **アクション**: `createWorkLog` / `updateWorkLog(id, ...)` / `deleteWorkLog(id)`。
- **バリデーション**: client_id・contract_id・work_date 必須。
- **状態**: 直近の稼働一覧（日付降順）。時間は「○h」表記。
- input の `name`: `client_id`,`contract_id`,`work_date`,`planned_hours`,`actual_hours`,`status`,`memo`。

## 画面6: 経費入力（`/expenses`）
- **目的**: 経費の登録・編集・削除＋定期経費の前月複製。
- **データ項目**:
  - expense_date（date・必須）
  - category（必須・自由入力。候補例: wifi / rent / mobile を出してよい）
  - amount（数値・必須・円）
  - allocation_rate（按分率・0〜1・既定 1）
  - is_recurring（チェックボックス）
  - memo（任意）
  - allocated_amount（**表示のみ**＝amount×按分率、サーバ計算済み）
- **アクション**: `createExpense` / `updateExpense(id, ...)` / `deleteExpense(id)` ＋「先月の定期経費を複製」ボタン → `copyRecurringFromPrevMonth(targetYearMonth)`。
- **状態**: 対象年月セレクタ（複製ボタンに渡す）。経費一覧（日付降順、計上額を表示）。「前月に定期経費がありません」等のエラー表示。
- input の `name`: `expense_date`,`category`,`amount`,`allocation_rate`,`is_recurring`,`memo`。

## 画面7: 月次サマリー（`/summary?ym=YYYY-MM`）
- **目的**: 年月を選び、契約別の請求と月の経費合計・合計金額を確認。表示専用。
- **行の表示項目**（`SummaryRow`）: クライアント名・契約名・実働時間合計・最低保証時間・請求対象時間・基本単価・超過単価・請求金額。
  - billing_type により「最低保証時間／請求対象時間／単価」が無い場合あり（fixed は時間系が空）。空欄は「-」表示。
- **月全体**: 経費合計（**別枠**）・合計金額（=請求合計／売上。経費は差し引かない）。
- **操作**: 年月セレクタ（変更で `?ym=YYYY-MM` に遷移）。
- 金額は3桁区切り、時間は「○h」。

---

## claude design への依頼まとめ
上記7画面＋共通シェルについて、一貫したデザインシステム（claude design 側で配色・タイポ・余白・コンポーネントを定義）で UI を作成してください。データ項目名（input の `name`）と Server Action のシグネチャは本ブリーフの通り維持してください。ロジック・計算結果はサーバ側で確定済みのものを表示するだけです。
