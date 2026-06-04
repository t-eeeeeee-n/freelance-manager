'use client'
import React from 'react'
import { useToast } from '@/components/toast'
import { markPaid, markUnpaid, updateDueDate } from './payment-actions'

export interface InvoiceRow {
  id: string
  invoice_no: string
  year_month: string
  issue_date: string
  total_amount: number
  withholding_amount: number
  status: 'unpaid' | 'paid'
  paid_date: string | null
  due_date: string | null
  memo: string | null
  clients: { name: string } | null
}

const yen = (n: number) => Math.round(n).toLocaleString('ja-JP')
const today = () => new Date().toISOString().slice(0, 10)

export function InvoicesTable({ invoices }: { invoices: InvoiceRow[] }) {
  const toast = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)

  const toggle = async (inv: InvoiceRow) => {
    setBusy(inv.id)
    const res = inv.status === 'paid' ? await markUnpaid(inv.id) : await markPaid(inv.id)
    setBusy(null)
    if (res.error) toast(res.error, 'err')
    else toast(inv.status === 'paid' ? '未入金に戻しました' : '入金済にしました')
  }

  const onDue = async (inv: InvoiceRow, value: string) => {
    const res = await updateDueDate(inv.id, value)
    if (res.error) toast(res.error, 'err')
    else toast('入金予定日を更新しました')
  }

  return (
    <div className="tablecard">
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr>
            <th>請求番号</th><th>クライアント</th><th>対象月</th>
            <th className="ar">金額</th><th className="ar">源泉</th><th className="ar">差引</th>
            <th>期日</th><th style={{ width: 110 }}>状態</th><th style={{ width: 120 }}>操作</th>
          </tr></thead>
          <tbody>
            {invoices.length === 0 && (
              <tr><td colSpan={9}><div className="empty"><p>まだ請求書を発行していません</p></div></td></tr>
            )}
            {invoices.map((inv) => {
              const overdue = inv.status === 'unpaid' && inv.due_date != null && inv.due_date < today()
              const net = inv.total_amount - (inv.withholding_amount ?? 0)
              return (
                <tr key={inv.id}>
                  <td className="num" style={{ fontWeight: 600 }}>{inv.invoice_no}</td>
                  <td>{inv.clients?.name ?? '—'}</td>
                  <td className="num">{inv.year_month}</td>
                  <td className="ar num yen">{yen(inv.total_amount)}</td>
                  <td className="ar num">{inv.withholding_amount ? `▲${yen(inv.withholding_amount)}` : '—'}</td>
                  <td className="ar num yen" style={{ fontWeight: 600 }}>{yen(net)}</td>
                  <td>
                    <input className="input num" type="date" defaultValue={inv.due_date ?? ''}
                      style={{ padding: '4px 8px', maxWidth: 150 }}
                      onChange={(e) => onDue(inv, e.target.value)} />
                  </td>
                  <td>
                    {inv.status === 'paid'
                      ? <span className="chip chip--dot" style={{ color: 'var(--ok, #16a34a)' }}>入金済 {inv.paid_date ?? ''}</span>
                      : <span className="chip chip--dot" style={{ color: overdue ? 'var(--danger, #dc2626)' : 'var(--text-dim)' }}>{overdue ? '期日超過' : '未入金'}</span>}
                  </td>
                  <td>
                    <button className="btn btn--ghost btn--sm" disabled={busy === inv.id} onClick={() => toggle(inv)}>
                      {busy === inv.id ? '…' : inv.status === 'paid' ? '未入金に戻す' : '入金済にする'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
