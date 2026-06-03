# Phase 2 — 請求書PDF 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 月次サマリーからクライアント単位で請求書PDFを生成し、採番・発行履歴を管理する機能を追加する。

**Architecture:** `@react-pdf/renderer` を使い、Server Action でPDFバイト列を生成してブラウザにダウンロードさせる。PDFファイルは保存せず都度生成。発行時に `invoices` テーブルへメタデータ（番号・金額スナップショット）を保存。発行者情報は `profile` テーブルで管理し、設定画面で編集できる。請求計算は既存の `lib/billing.ts` / `lib/summary.ts` をそのまま使用（再計算しない）。

**Tech Stack:** `@react-pdf/renderer` / Next.js App Router (Server Actions) / Supabase / TypeScript / Vitest（採番ロジック）

---

## ファイル構成

```
supabase/migrations/0002_phase2.sql   ← profile / invoices テーブル + RLS
lib/invoice-number.ts                 ← 採番純関数（TDD）
lib/invoice-number.test.ts
lib/pdf.tsx                           ← @react-pdf/renderer PDF テンプレート（pure）
app/(app)/settings/profile/
  page.tsx                            ← プロフィール設定画面（Server Component）
  profile-ui.tsx                      ← Client Component（フォーム）
  actions.ts                          ← upsertProfile Server Action
app/(app)/invoices/
  page.tsx                            ← 発行履歴一覧（Server Component）
app/(app)/summary/
  page.tsx                            ← 既存。「請求書を発行」ボタンを追加
  invoice-actions.ts                  ← generateInvoicePdf Server Action
components/rail-nav.tsx               ← 設定・請求書ナビリンク追加
```

---

## Task 1: DB マイグレーション（profile + invoices）

**Files:**
- Create: `supabase/migrations/0002_phase2.sql`

- [ ] **Step 1: SQLファイルを作成**

`supabase/migrations/0002_phase2.sql`:
```sql
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
```

- [ ] **Step 2: Supabase SQL Editor で実行**

Supabase ダッシュボード → SQL Editor に `0002_phase2.sql` の内容を貼り付けて Run。`profile` と `invoices` テーブルが作成されること、RLS が有効なことを Table Editor で確認。

- [ ] **Step 3: コミット**

```bash
git add supabase/migrations/0002_phase2.sql
git commit -m "feat: add profile and invoices tables (Phase 2 migration)"
```

---

## Task 2: 採番ロジック（TDD）

**Files:**
- Create: `lib/invoice-number.ts`, `lib/invoice-number.test.ts`

採番ルール: `invoice_no = YYYY-MM-NNN`（例: `2026-06-001`）。同一年月内で既存の最大連番+1。

- [ ] **Step 1: 失敗するテストを書く**

`lib/invoice-number.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { nextInvoiceNo } from './invoice-number'

describe('nextInvoiceNo', () => {
  it('同一年月の既存なし → 001', () => {
    expect(nextInvoiceNo('2026-06', [])).toBe('2026-06-001')
  })
  it('2件存在 → 003', () => {
    expect(nextInvoiceNo('2026-06', ['2026-06-001', '2026-06-002'])).toBe('2026-06-003')
  })
  it('異なる年月は無視', () => {
    expect(nextInvoiceNo('2026-06', ['2026-05-010'])).toBe('2026-06-001')
  })
  it('連番は3桁ゼロパディング', () => {
    expect(nextInvoiceNo('2026-06', ['2026-06-009'])).toBe('2026-06-010')
  })
  it('99件存在 → 100（3桁超え）', () => {
    const existing = Array.from({ length: 99 }, (_, i) =>
      `2026-06-${String(i + 1).padStart(3, '0')}`)
    expect(nextInvoiceNo('2026-06', existing)).toBe('2026-06-100')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- lib/invoice-number.test.ts`
Expected: FAIL（`nextInvoiceNo` 未定義）

- [ ] **Step 3: 実装**

`lib/invoice-number.ts`:
```ts
export function nextInvoiceNo(yearMonth: string, existingNos: string[]): string {
  const same = existingNos.filter(n => n.startsWith(yearMonth + '-'))
  const max = same.reduce((m, n) => {
    const seq = Number(n.slice(yearMonth.length + 1))
    return seq > m ? seq : m
  }, 0)
  return `${yearMonth}-${String(max + 1).padStart(3, '0')}`
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- lib/invoice-number.test.ts`
Expected: PASS（5件）

- [ ] **Step 5: 全テスト確認**

Run: `npm test`
Expected: PASS（全25件）

- [ ] **Step 6: コミット**

```bash
git add lib/invoice-number.ts lib/invoice-number.test.ts
git commit -m "feat: add invoice number generation with tests"
```

---

## Task 3: @react-pdf/renderer インストールと日本語フォント設定

**Files:**
- Modify: `package.json`
- Create: `public/fonts/NotoSansJP-Regular.ttf`, `public/fonts/NotoSansJP-Bold.ttf`（Google Fonts からダウンロード）
- Create: `lib/pdf.tsx`

`@react-pdf/renderer` は日本語フォントを手動で埋め込む必要がある（ブラウザのシステムフォントを使えない）。

- [ ] **Step 1: パッケージをインストール**

```bash
npm install @react-pdf/renderer
npm install -D @types/react-pdf 2>/dev/null || true
```

Expected: `package.json` に `@react-pdf/renderer` が追加される。

- [ ] **Step 2: Noto Sans JP フォントファイルを配置**

Google Fonts の Noto Sans JP（Regular と Bold の ttf）を以下に配置:
- `public/fonts/NotoSansJP-Regular.ttf`
- `public/fonts/NotoSansJP-Bold.ttf`

ダウンロード方法（ターミナルから）:
```bash
mkdir -p public/fonts
curl -L "https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf" -o public/fonts/NotoSansJP-variable.ttf 2>/dev/null || echo "manual download needed"
```

もしダウンロードできない場合は、https://fonts.google.com/noto/specimen/Noto+Sans+JP から手動でダウンロードして `public/fonts/` に配置する。その場合ファイル名は `NotoSansJP-Regular.ttf` と `NotoSansJP-Bold.ttf` とする。

- [ ] **Step 3: PDF テンプレートを作成**

`lib/pdf.tsx`:
```tsx
import { Document, Page, Text, View, StyleSheet, Font, pdf } from '@react-pdf/renderer'
import type { SummaryRow } from './summary'

Font.register({
  family: 'NotoSansJP',
  fonts: [
    { src: '/fonts/NotoSansJP-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/NotoSansJP-Bold.ttf', fontWeight: 700 },
  ],
})

const S = StyleSheet.create({
  page: { fontFamily: 'NotoSansJP', fontSize: 10, padding: 40, color: '#1a1a1a' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 6 },
  section: { marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderColor: '#e0e0e0' },
  label: { color: '#555' },
  bold: { fontWeight: 700 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: '#1a1a1a', marginTop: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, backgroundColor: '#f5f5f5', paddingHorizontal: 6 },
  meta: { fontSize: 9, color: '#555', marginBottom: 2 },
  h2: { fontSize: 12, fontWeight: 700, marginBottom: 8 },
})

const yen = (n: number | null) => n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`
const hrs = (n: number | null) => n == null ? '—' : `${n}h`

export interface InvoiceData {
  invoiceNo: string
  issueDate: string       // 'YYYY-MM-DD'
  yearMonth: string       // 'YYYY-MM'
  clientName: string
  rows: SummaryRow[]
  totalAmount: number
  memo?: string
  profile: {
    display_name: string | null
    address: string | null
    email: string | null
    phone: string | null
    bank_info: string | null
  }
}

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const [y, m] = data.yearMonth.split('-')
  const ymLabel = `${y}年${Number(m)}月`
  return (
    <Document title={`請求書 ${data.invoiceNo}`}>
      <Page size="A4" style={S.page}>
        {/* ヘッダー */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
          <Text style={S.title}>請求書</Text>
          <View>
            <Text style={S.meta}>請求番号: {data.invoiceNo}</Text>
            <Text style={S.meta}>発行日: {data.issueDate}</Text>
            <Text style={S.meta}>対象月: {ymLabel}</Text>
          </View>
        </View>

        {/* 宛先 */}
        <View style={S.section}>
          <Text style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{data.clientName} 御中</Text>
        </View>

        {/* 発行者 */}
        <View style={{ alignItems: 'flex-end', marginBottom: 20 }}>
          {data.profile.display_name && <Text style={{ fontWeight: 700, fontSize: 11 }}>{data.profile.display_name}</Text>}
          {data.profile.address && <Text style={S.meta}>{data.profile.address}</Text>}
          {data.profile.email && <Text style={S.meta}>{data.profile.email}</Text>}
          {data.profile.phone && <Text style={S.meta}>{data.profile.phone}</Text>}
        </View>

        {/* 品目テーブル */}
        <View style={S.section}>
          <Text style={S.h2}>請求内容</Text>
          <View style={S.headerRow}>
            <Text style={[S.bold, { flex: 3 }]}>品目</Text>
            <Text style={[S.bold, { flex: 1, textAlign: 'right' }]}>時間</Text>
            <Text style={[S.bold, { flex: 1, textAlign: 'right' }]}>単価</Text>
            <Text style={[S.bold, { flex: 1, textAlign: 'right' }]}>金額</Text>
          </View>
          {data.rows.map((r) => (
            <View key={r.contractId} style={S.row}>
              <Text style={{ flex: 3 }}>{r.contractName}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{r.billableHours != null ? hrs(r.billableHours) : '—'}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{r.baseRate != null ? yen(r.baseRate) : '—'}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{yen(r.amount)}</Text>
            </View>
          ))}
          <View style={S.totalRow}>
            <Text style={[S.bold, { flex: 4 }]}>合計</Text>
            <Text style={[S.bold, { flex: 1, textAlign: 'right', fontSize: 13 }]}>{yen(data.totalAmount)}</Text>
          </View>
        </View>

        {/* 振込先 */}
        {data.profile.bank_info && (
          <View style={[S.section, { marginTop: 20 }]}>
            <Text style={S.h2}>振込先</Text>
            <Text style={S.meta}>{data.profile.bank_info}</Text>
          </View>
        )}

        {/* メモ */}
        {data.memo && (
          <View style={S.section}>
            <Text style={S.h2}>備考</Text>
            <Text style={S.meta}>{data.memo}</Text>
          </View>
        )}
      </Page>
    </Document>
  )
}

/** Server側でPDFバイト列を生成する（Server Action から呼ぶ） */
export async function renderInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const blob = await pdf(<InvoiceDocument data={data} />).toBlob()
  return new Uint8Array(await blob.arrayBuffer())
}
```

- [ ] **Step 4: TypeScript 確認**

Run: `npx tsc --noEmit`
Expected: エラーなし（`@react-pdf/renderer` の型が解決される）。
もしエラーが出る場合は `@types/react-pdf` をインストールするか、`tsconfig.json` で `compilerOptions.types` を調整する。

- [ ] **Step 5: コミット**

```bash
git add package.json package-lock.json lib/pdf.tsx public/fonts/
git commit -m "feat: add @react-pdf/renderer with Noto Sans JP font template"
```

---

## Task 4: プロフィール設定画面

**Files:**
- Create: `app/(app)/settings/profile/actions.ts`
- Create: `app/(app)/settings/profile/profile-ui.tsx`
- Create: `app/(app)/settings/profile/page.tsx`

発行者情報（氏名/屋号・住所・連絡先・振込先）を1行だけ保持する設定画面。

- [ ] **Step 1: Server Action（upsert）を作成**

`app/(app)/settings/profile/actions.ts`:
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function upsertProfile(formData: FormData) {
  const display_name = String(formData.get('display_name') ?? '').trim() || null
  const address = String(formData.get('address') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  const bank_info = String(formData.get('bank_info') ?? '').trim() || null

  const supabase = await createClient()

  // profile は単一行 — 既存があれば update、なければ insert
  const { data: existing } = await supabase.from('profile').select('id').limit(1).single()
  if (existing) {
    const { error } = await supabase.from('profile')
      .update({ display_name, address, email, phone, bank_info, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return { error: '保存に失敗しました' }
  } else {
    const { error } = await supabase.from('profile')
      .insert({ display_name, address, email, phone, bank_info })
    if (error) return { error: '保存に失敗しました' }
  }
  revalidatePath('/settings/profile')
  return { error: null }
}
```

- [ ] **Step 2: Client Component（フォーム）を作成**

`app/(app)/settings/profile/profile-ui.tsx`:
```tsx
'use client'
import React from 'react'
import { upsertProfile } from './actions'
import { useToast } from '@/components/toast'

interface Profile {
  display_name: string | null
  address: string | null
  email: string | null
  phone: string | null
  bank_info: string | null
}

export function ProfileUI({ profile }: { profile: Profile | null }) {
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRef.current) return
    setBusy(true); setError(null)
    const res = await upsertProfile(new FormData(formRef.current))
    setBusy(false)
    if (res.error) setError(res.error)
    else toast('プロフィールを保存しました')
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
      {error && <div className="errbox" style={{ marginBottom: 16 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="field">
          <label>氏名 / 屋号</label>
          <input className="input" name="display_name" defaultValue={profile?.display_name ?? ''} placeholder="山田 太郎 / 山田デザイン事務所" />
        </div>
        <div className="field">
          <label>住所</label>
          <textarea className="textarea" name="address" defaultValue={profile?.address ?? ''} placeholder="〒000-0000 東京都…" rows={2} />
        </div>
        <div className="field">
          <label>メールアドレス</label>
          <input className="input" type="email" name="email" defaultValue={profile?.email ?? ''} placeholder="you@example.com" />
        </div>
        <div className="field">
          <label>電話番号</label>
          <input className="input" name="phone" defaultValue={profile?.phone ?? ''} placeholder="090-0000-0000" />
        </div>
        <div className="field">
          <label>振込先</label>
          <textarea className="textarea" name="bank_info" defaultValue={profile?.bank_info ?? ''} placeholder="〇〇銀行 △△支店 普通 1234567 ヤマダ タロウ" rows={3} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Server Component（ページ）を作成**

`app/(app)/settings/profile/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { ProfileUI } from './profile-ui'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profile').select('*').limit(1).single()
  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>プロフィール設定</h1><p>請求書に表示される発行者情報</p></div>
      </div>
      <ProfileUI profile={profile ?? null} />
    </div>
  )
}
```

- [ ] **Step 4: tsc + ビルド確認**

Run: `npx tsc --noEmit` → エラーなし
Run: `npm run build` → 成功

- [ ] **Step 5: コミット**

```bash
git add "app/(app)/settings"
git commit -m "feat: add profile settings page for invoice issuer info"
```

---

## Task 5: 請求書発行 Server Action + 発行履歴ページ

**Files:**
- Create: `app/(app)/summary/invoice-actions.ts`
- Create: `app/(app)/invoices/page.tsx`

- [ ] **Step 1: 請求書発行 Server Action を作成**

`app/(app)/summary/invoice-actions.ts`:
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { buildMonthlySummary } from '@/lib/summary'
import { nextInvoiceNo } from '@/lib/invoice-number'
import { renderInvoicePdf } from '@/lib/pdf'
import type { Contract, WorkLog, Expense } from '@/lib/types'

export async function generateInvoicePdf(clientId: string, yearMonth: string, memo?: string) {
  const supabase = await createClient()

  // 発行者プロフィール取得
  const { data: profile } = await supabase.from('profile').select('*').limit(1).single()

  // クライアント情報
  const { data: clientData } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!clientData) return { error: 'クライアントが見つかりません' }

  // 対象月の稼働・契約・経費を取得
  const monthStart = `${yearMonth}-01`
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate()
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`

  const [{ data: contracts }, { data: logs }, { data: expenses }] = await Promise.all([
    supabase.from('contracts').select('*').eq('client_id', clientId).eq('is_active', true),
    supabase.from('work_logs').select('*').eq('client_id', clientId).gte('work_date', monthStart).lte('work_date', monthEnd),
    supabase.from('expenses').select('allocated_amount').gte('expense_date', monthStart).lte('expense_date', monthEnd),
  ])

  const expenseTotal = ((expenses ?? []) as { allocated_amount: number }[]).reduce((s, e) => s + (e.allocated_amount ?? 0), 0)
  const summary = buildMonthlySummary(yearMonth, (contracts ?? []) as Contract[], (logs ?? []) as WorkLog[], expenseTotal)

  if (summary.rows.length === 0) return { error: 'この月・クライアントの請求データがありません' }

  // 採番
  const { data: existingInvoices } = await supabase.from('invoices').select('invoice_no').eq('year_month', yearMonth)
  const existingNos = (existingInvoices ?? []).map((i: { invoice_no: string }) => i.invoice_no)
  const invoiceNo = nextInvoiceNo(yearMonth, existingNos)
  const issueDate = new Date().toISOString().slice(0, 10)

  // PDF生成
  const pdfBytes = await renderInvoicePdf({
    invoiceNo,
    issueDate,
    yearMonth,
    clientName: clientData.name,
    rows: summary.rows,
    totalAmount: summary.totalBilling,
    memo,
    profile: {
      display_name: profile?.display_name ?? null,
      address: profile?.address ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      bank_info: profile?.bank_info ?? null,
    },
  })

  // 発行履歴を保存
  await supabase.from('invoices').insert({
    invoice_no: invoiceNo,
    client_id: clientId,
    year_month: yearMonth,
    issue_date: issueDate,
    total_amount: summary.totalBilling,
    memo: memo ?? null,
  })

  // バイト列をBase64で返す（Server Action はバイナリを直接返せないため）
  const base64 = Buffer.from(pdfBytes).toString('base64')
  return { error: null, base64, invoiceNo, filename: `invoice-${invoiceNo}.pdf` }
}
```

- [ ] **Step 2: 発行履歴一覧ページを作成**

`app/(app)/invoices/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'

interface Invoice {
  id: string; invoice_no: string; year_month: string; issue_date: string; total_amount: number; memo: string | null
  clients: { name: string } | null
}

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoices')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })

  const invoices = (data ?? []) as Invoice[]
  const yen = (n: number) => Math.round(n).toLocaleString('ja-JP')

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>請求書履歴</h1><p>発行済みの請求書一覧</p></div>
      </div>
      <div className="tablecard">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>請求番号</th><th>クライアント</th><th>対象月</th>
              <th>発行日</th><th className="ar">金額</th><th>備考</th>
            </tr></thead>
            <tbody>
              {invoices.length === 0 && (
                <tr><td colSpan={6}>
                  <div className="empty"><p>まだ請求書を発行していません</p></div>
                </td></tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600, fontFamily: 'var(--font-num)' }}>{inv.invoice_no}</td>
                  <td>{inv.clients?.name ?? '—'}</td>
                  <td className="num">{inv.year_month}</td>
                  <td className="num">{inv.issue_date}</td>
                  <td className="ar num yen">{yen(inv.total_amount)}</td>
                  <td className="dim" style={{ fontSize: 'var(--small)' }}>{inv.memo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: tsc + ビルド確認**

Run: `npx tsc --noEmit` → エラーなし
Run: `npm run build` → 成功

- [ ] **Step 4: コミット**

```bash
git add "app/(app)/summary/invoice-actions.ts" "app/(app)/invoices"
git commit -m "feat: add invoice generation server action and history page"
```

---

## Task 6: 月次サマリーに「請求書を発行」ボタンを追加

**Files:**
- Create: `app/(app)/summary/invoice-button.tsx`
- Modify: `app/(app)/summary/page.tsx`

サマリーページにクライアントごとの「請求書を発行」ボタンを追加し、クリックでPDFをダウンロードする。

- [ ] **Step 1: 発行ボタン Client Component を作成**

`app/(app)/summary/invoice-button.tsx`:
```tsx
'use client'
import React from 'react'
import { generateInvoicePdf } from './invoice-actions'
import { useToast } from '@/components/toast'
import { Icon } from '@/components/icon'

export function InvoiceButton({ clientId, clientName, yearMonth }: {
  clientId: string; clientName: string; yearMonth: string
}) {
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)

  const handleClick = async () => {
    setBusy(true)
    const res = await generateInvoicePdf(clientId, yearMonth)
    setBusy(false)
    if (res.error) {
      toast(res.error, 'err')
      return
    }
    // Base64 → Blob → ダウンロード
    const bytes = Uint8Array.from(atob(res.base64!), c => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.filename!
    a.click()
    URL.revokeObjectURL(url)
    toast(`請求書 ${res.invoiceNo} を発行しました`)
  }

  return (
    <button className="btn btn--ghost btn--sm" onClick={handleClick} disabled={busy}>
      <Icon name="doc" size={14} />
      {busy ? '生成中…' : 'PDF発行'}
    </button>
  )
}
```

- [ ] **Step 2: サマリーページにクライアント名とボタンを追加**

`app/(app)/summary/page.tsx` を修正する。

現状の `summary/page.tsx` は `r.clientId`（UUID）を表示している。クライアント名を表示するため、クライアント一覧もフェッチして `clientMap` を作る。合わせて `InvoiceButton` をインポートして各クライアント行に追加。

`page.tsx` の fetchブロックに `clients` を追加:
```ts
const [{ data: contracts }, { data: logs }, { data: expenses }, { data: clients }] = await Promise.all([
  supabase.from('contracts').select('*').eq('is_active', true),
  supabase.from('work_logs').select('*').gte('work_date', monthStart).lte('work_date', monthEnd),
  supabase.from('expenses').select('allocated_amount').gte('expense_date', monthStart).lte('expense_date', monthEnd),
  supabase.from('clients').select('id, name'),
])
const clientMap = Object.fromEntries(((clients ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
```

テーブルの `<th>クライアント</th>` 行のデータセルを UUID から名前に変更:
```tsx
<td style={{ fontWeight: 600 }}>{clientMap[r.clientId] ?? r.clientId}</td>
```

テーブルに「発行」列を追加（ヘッダー + データ行）:
```tsx
// thead に追加
<th style={{ width: 100 }}>請求書</th>

// tbody の各行に追加（最後の列）
<td>
  <InvoiceButton clientId={r.clientId} clientName={clientMap[r.clientId] ?? ''} yearMonth={yearMonth} />
</td>
```

- [ ] **Step 3: tsc + ビルド確認**

Run: `npx tsc --noEmit` → エラーなし
Run: `npm run build` → 成功

- [ ] **Step 4: 手動動作確認**

1. Supabase で `profile` にプロフィールを1件設定（設定ページから）
2. `/summary` で年月を選択
3. 「PDF発行」ボタンをクリック
4. PDFがダウンロードされること、日本語が表示されること
5. `/invoices` に発行履歴が記録されていることを確認

- [ ] **Step 5: コミット**

```bash
git add "app/(app)/summary" "app/(app)/invoices"
git commit -m "feat: add PDF invoice button to summary page with download"
```

---

## Task 7: ナビゲーションに設定・請求書を追加

**Files:**
- Modify: `components/rail-nav.tsx`
- Modify: `components/topstrip.tsx`

- [ ] **Step 1: レールナビに項目を追加**

`components/rail-nav.tsx` の `NAV` 配列に追加:
```ts
const NAV = [
  { href: '/dashboard', label: 'ダッシュボード', icon: 'home' },
  { href: '/clients', label: 'クライアント', icon: 'users' },
  { href: '/contracts', label: '契約条件', icon: 'doc' },
  { href: '/work-logs', label: '稼働ログ', icon: 'clock' },
  { href: '/expenses', label: '経費', icon: 'wallet' },
  { href: '/summary', label: '月次サマリー', icon: 'chart' },
  { href: '/invoices', label: '請求書履歴', icon: 'copy' },
  { href: '/settings/profile', label: '設定', icon: 'edit' },
]
```

- [ ] **Step 2: topstrip の LABELS / DESCS を更新**

`components/topstrip.tsx` に追記:
```ts
const LABELS: Record<string, string> = {
  ...
  '/invoices': '請求書履歴',
  '/settings/profile': '設定',
}
const DESCS: Record<string, string> = {
  ...
  '/invoices': '発行済み請求書の一覧',
  '/settings/profile': '請求書の発行者情報',
}
```

- [ ] **Step 3: tsc + ビルド + コミット**

Run: `npx tsc --noEmit && npm run build`
```bash
git add components/
git commit -m "feat: add invoices and settings to nav"
```

---

## Task 8: 全テスト・最終ビルド確認と push

- [ ] **Step 1: 全テスト実行**

Run: `npm test`
Expected: PASS（billing 20件 + invoice-number 5件 = 25件以上）

- [ ] **Step 2: 本番ビルド確認**

Run: `npm run build`
Expected: エラーなし、全ページ生成

- [ ] **Step 3: push**

```bash
git push origin main
```

Vercel が自動デプロイ。デプロイ後に本番で PDF 発行を確認。

---

## Phase 2 完了の定義
- `npm test` が全て PASS
- `npm run build` が成功
- 月次サマリーから「PDF発行」→ 日本語PDFがダウンロードされる
- 発行番号が `YYYY-MM-NNN` 形式で採番される
- 発行履歴ページに記録が残る
- プロフィール設定が反映されている

## 既知の制約・注意
- `@react-pdf/renderer` は Node.js 環境（Server Action）でのみ動作。Client Component からは呼ばない。
- 日本語フォント（Noto Sans JP の ttf ファイル）は `public/fonts/` に手動で配置が必要。フォントファイルは git に含めてよい（OFLライセンス・再配布可）。
- PDF はファイル保存せず都度生成（Vercel Hobby の無料枠ではストレージ不要）。
- `Buffer` は Node.js 組み込み。Vercel の Server Actions は Node.js runtime で動くので使用可能。
