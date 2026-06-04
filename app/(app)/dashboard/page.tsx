import { createClient } from '@/lib/supabase/server'
import { buildMonthlySummary } from '@/lib/summary'
import type { Contract, WorkLog, Expense } from '@/lib/types'
import { Icon } from '@/components/icon'
import { BillingChip } from '@/components/page-chrome'
import Link from 'next/link'

export default async function DashboardPage() {
  const yearMonth = new Date().toISOString().slice(0, 7)
  const monthStart = `${yearMonth}-01`
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate()
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`
  const ymLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${y}年${Number(m)}月` }

  const supabase = await createClient()
  const [{ data: contracts }, { data: logs }, { data: expenses }, { data: clients }, { data: unpaid }] = await Promise.all([
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('work_logs').select('*').gte('work_date', monthStart).lte('work_date', monthEnd),
    supabase.from('expenses').select('allocated_amount').gte('expense_date', monthStart).lte('expense_date', monthEnd),
    supabase.from('clients').select('id, name'),
    supabase.from('invoices').select('total_amount, due_date').eq('status', 'unpaid'),
  ])
  const clientMap = Object.fromEntries(((clients ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))

  const expenseTotal = ((expenses ?? []) as Pick<Expense, 'allocated_amount'>[])
    .reduce((s, e) => s + (e.allocated_amount ?? 0), 0)

  const today = new Date().toISOString().slice(0, 10)
  const unpaidRows = (unpaid ?? []) as { total_amount: number; due_date: string | null }[]
  const unpaidTotal = unpaidRows.reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const unpaidCount = unpaidRows.length
  const overdueCount = unpaidRows.filter((r) => r.due_date != null && r.due_date < today).length

  const summary = buildMonthlySummary(
    yearMonth,
    (contracts ?? []) as Contract[],
    (logs ?? []) as WorkLog[],
    expenseTotal,
  )
  const totalHours = summary.rows.reduce((s, r) => s + r.workedHours, 0)
  const maxAmt = Math.max(1, ...summary.rows.map((r) => r.amount))
  const yen = (n: number) => Math.round(n).toLocaleString('ja-JP')
  const hrs = (n: number) => Number.isInteger(n) ? `${n}h` : `${n.toFixed(1)}h`

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>ダッシュボード</h1>
          <p>{ymLabel(yearMonth)}の概況</p>
        </div>
        <span className="chip chip--accent chip--dot">{ymLabel(yearMonth)}</span>
      </div>

      <div className="grid-stats">
        <div className="card statcard">
          <div className="statcard__label"><span className="statcard__ic"><Icon name="clock" size={17} /></span>今月の稼働時間</div>
          <div className="stat"><span className="v num">{hrs(totalHours)}</span><span className="u">時間</span></div>
        </div>
        <div className="card statcard">
          <div className="statcard__label"><span className="statcard__ic"><Icon name="chart" size={17} /></span>今月の請求見込み</div>
          <div className="stat"><span className="v num yen">{yen(summary.totalBilling)}</span></div>
        </div>
        <div className="card statcard">
          <div className="statcard__label"><span className="statcard__ic"><Icon name="wallet" size={17} /></span>今月の経費合計</div>
          <div className="stat"><span className="v num yen">{yen(summary.expenseTotal)}</span></div>
        </div>
        <div className="card statcard">
          <div className="statcard__label"><span className="statcard__ic"><Icon name="copy" size={17} /></span>未入金</div>
          <div className="stat"><span className="v num yen">{yen(unpaidTotal)}</span></div>
          <div style={{ fontSize: 'var(--small)', color: overdueCount > 0 ? 'var(--danger, #dc2626)' : 'var(--text-faint)' }}>
            {unpaidCount}件{overdueCount > 0 ? ` ・ 期日超過 ${overdueCount}件` : ''}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <div className="tablecard__head">
          <h2>契約別の稼働状況</h2>
          <span className="count">{summary.rows.length}件</span>
          <span className="spacer" />
          <Link href="/summary" className="btn btn--ghost btn--sm">サマリーを見る<Icon name="chevR" size={14} /></Link>
        </div>
        {summary.rows.length === 0 ? (
          <div className="empty">
            <div className="empty__icon"><Icon name="clock" size={22} /></div>
            <p>今月の稼働はまだありません</p>
            <Link href="/work-logs" className="btn btn--primary btn--sm">稼働を記録する</Link>
          </div>
        ) : (
          summary.rows.map((r) => (
            <div className="contractrow" key={r.contractId}>
              <div>
                <div className="contractrow__name">{r.contractName} <BillingChip type={r.billingType} /></div>
                <div className="contractrow__client" style={{ fontSize: 'var(--small)', color: 'var(--text-faint)' }}>{clientMap[r.clientId] ?? '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontWeight: 600 }}>{r.workedHours != null ? hrs(r.workedHours) : '—'}</div>
                <div className="bar"><span style={{ width: `${Math.round((r.amount / maxAmt) * 100)}%` }} /></div>
              </div>
              <div className="num yen" style={{ fontWeight: 700, minWidth: 96, textAlign: 'right' }}>{yen(r.amount)}</div>
            </div>
          ))
        )}
      </div>

      <h3 className="sectitle" style={{ marginTop: 'var(--gap)' }}>クイック操作</h3>
      <div className="quick">
        {[
          { href: '/work-logs', icon: 'clock', t: '稼働を記録', d: '今日の稼働を入力' },
          { href: '/expenses', icon: 'wallet', t: '経費を登録', d: '領収書の経費を追加' },
          { href: '/contracts', icon: 'doc', t: '契約を確認', d: '条件・単価の設定' },
          { href: '/summary', icon: 'chart', t: '月次サマリー', d: '請求額を集計' },
        ].map((q) => (
          <Link key={q.href} href={q.href} className="quickcard">
            <span className="quickcard__ic"><Icon name={q.icon} size={19} /></span>
            <span><span className="quickcard__t">{q.t}</span><span className="quickcard__d">{q.d}</span></span>
          </Link>
        ))}
      </div>
    </div>
  )
}
