import { createClient } from '@/lib/supabase/server'
import { buildMonthlySummary } from '@/lib/summary'
import type { Contract, WorkLog, Expense } from '@/lib/types'
import { BillingChip } from '@/components/page-chrome'
import { Icon } from '@/components/icon'
import Link from 'next/link'

export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const { ym } = await searchParams
  const yearMonth = ym ?? new Date().toISOString().slice(0, 7)
  const monthStart = `${yearMonth}-01`
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate()
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`
  const ymLabel = (s: string) => { const [y, m] = s.split('-'); return `${y}年${Number(m)}月` }
  const yen = (n: number | null) => n == null ? '-' : Math.round(n).toLocaleString('ja-JP')
  const hrs = (n: number | null) => n == null ? '-' : (Number.isInteger(n) ? `${n}h` : `${n.toFixed(1)}h`)

  // prev/next month for navigation links
  const [y, m] = yearMonth.split('-').map(Number)
  const prev = m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`
  const next = m === 12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,'0')}`

  const supabase = await createClient()
  const [{ data: contracts }, { data: logs }, { data: expenses }] = await Promise.all([
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('work_logs').select('*').gte('work_date', monthStart).lte('work_date', monthEnd),
    supabase.from('expenses').select('allocated_amount').gte('expense_date', monthStart).lte('expense_date', monthEnd),
  ])

  const expenseTotal = ((expenses ?? []) as Pick<Expense, 'allocated_amount'>[])
    .reduce((s, e) => s + (e.allocated_amount ?? 0), 0)

  const summary = buildMonthlySummary(
    yearMonth,
    (contracts ?? []) as Contract[],
    (logs ?? []) as WorkLog[],
    expenseTotal,
  )

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>月次サマリー</h1><p>契約別の請求と月の経費合計。表示専用です。</p></div>
        <div className="ymselect">
          <Link href={`/summary?ym=${prev}`} className="nav" aria-label="前月"><Icon name="chevL" size={16} /></Link>
          <span className="cur num">{ymLabel(yearMonth)}</span>
          <Link href={`/summary?ym=${next}`} className="nav" aria-label="翌月"><Icon name="chevR" size={16} /></Link>
        </div>
      </div>

      <div className="tablecard">
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>クライアント</th><th>契約</th>
                <th className="ar">実働</th><th className="ar">最低保証</th><th className="ar">請求対象</th>
                <th className="ar">基本単価</th><th className="ar">超過単価</th><th className="ar">請求金額</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.length === 0 && (
                <tr><td colSpan={8}>
                  <div className="empty"><div className="empty__icon"><Icon name="chart" size={22} /></div><p>{ymLabel(yearMonth)}に集計対象の稼働がありません</p></div>
                </td></tr>
              )}
              {summary.rows.map((r) => (
                <tr key={r.contractId}>
                  <td style={{ fontWeight: 600 }}>{r.clientId}</td>
                  <td><span className="dim">{r.contractName}</span> <BillingChip type={r.billingType} /></td>
                  <td className="ar num">{r.workedHours != null ? hrs(r.workedHours) : <span className="muted">-</span>}</td>
                  <td className="ar num">{r.minimumHours != null ? hrs(r.minimumHours) : <span className="muted">-</span>}</td>
                  <td className="ar num">{r.billableHours != null ? hrs(r.billableHours) : <span className="muted">-</span>}</td>
                  <td className="ar num">{r.baseRate != null ? <span className="yen">{yen(r.baseRate)}</span> : <span className="muted">-</span>}</td>
                  <td className="ar num">{r.overtimeRate != null ? <span className="yen">{yen(r.overtimeRate)}</span> : <span className="muted">-</span>}</td>
                  <td className="ar num yen" style={{ fontWeight: 700 }}>{yen(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            {summary.rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                  <td colSpan={7} style={{ fontWeight: 700, textAlign: 'right', height: 52 }}>請求合計（売上）</td>
                  <td className="ar num yen" style={{ fontWeight: 800, fontSize: 'var(--h2)' }}>{yen(summary.totalBilling)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="summary-totals">
        <div className="card totalcard">
          <span className="lbl">経費合計（別枠）</span>
          <span className="big num yen">{yen(summary.expenseTotal)}</span>
          <span className="sub">{ymLabel(yearMonth)}の計上額。売上からは差し引きません。</span>
        </div>
        <div className="card totalcard totalcard--accent">
          <span className="lbl">合計金額（売上）</span>
          <span className="big num yen">{yen(summary.totalBilling)}</span>
          <span className="sub">契約別の請求金額の合計。</span>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 'var(--small)', marginTop: 16, textAlign: 'center' }}>
        固定報酬の契約は時間系の項目が「-」になります。
      </p>
    </div>
  )
}
