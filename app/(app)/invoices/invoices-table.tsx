'use client'
import React from 'react'
import { useToast } from '@/components/toast'
import { Icon } from '@/components/icon'
import { CustomDatePicker } from '@/components/custom-date-picker'
import { markPaid, markUnpaid, updateDueDate, deleteInvoice } from './payment-actions'

export interface InvoiceRow {
  id: string
  invoice_no: string
  year_month: string
  issue_date: string
  total_amount: number
  consumption_tax: number
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

  const del = async (inv: InvoiceRow) => {
    setBusy(inv.id)
    const res = await deleteInvoice(inv.id)
    setBusy(null)
    if (res.error) toast(res.error, 'err')
    else toast(`請求書 ${inv.invoice_no} を削除しました`, 'info')
  }

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
            <th>期日</th><th style={{ width: 110 }}>状態</th><th style={{ width: 160 }}>操作</th>
          </tr></thead>
          <tbody>
            {invoices.length === 0 && (
              <tr><td colSpan={9}><div className="empty"><p>まだ請求書を発行していません</p></div></td></tr>
            )}
            {invoices.map((inv) => {
              const overdue = inv.status === 'unpaid' && inv.due_date != null && inv.due_date < today()
              const gross = inv.total_amount + (inv.consumption_tax ?? 0)  // 税込請求額
              const net = gross - (inv.withholding_amount ?? 0)            // 源泉差引後の手取り
              return (
                <tr key={inv.id}>
                  <td className="num" style={{ fontWeight: 600 }}>{inv.invoice_no}</td>
                  <td>{inv.clients?.name ?? '—'}</td>
                  <td className="num">{inv.year_month}</td>
                  <td className="ar num yen">{yen(gross)}</td>
                  <td className="ar num">{inv.withholding_amount ? `▲${yen(inv.withholding_amount)}` : '—'}</td>
                  <td className="ar num yen" style={{ fontWeight: 600 }}>{yen(net)}</td>
                  <td><DueDateCell value={inv.due_date ?? ''} onSave={(v) => onDue(inv, v)} /></td>
                  <td>
                    {inv.status === 'paid'
                      ? <span className="chip chip--dot" style={{ color: 'var(--pos)' }}>入金済 {inv.paid_date ?? ''}</span>
                      : <span className="chip chip--dot" style={{ color: overdue ? 'var(--warn)' : 'var(--text-dim)' }}>{overdue ? '期日超過' : '未入金'}</span>}
                  </td>
                  <td>
                    <div className="rowactions">
                      <button className="btn btn--ghost btn--sm" disabled={busy === inv.id} onClick={() => toggle(inv)}>
                        {busy === inv.id ? '…' : inv.status === 'paid' ? '未入金に戻す' : '入金済にする'}
                      </button>
                      <button className="btn btn--icon btn--danger" disabled={busy === inv.id} onClick={() => del(inv)} title="削除">
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
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

function DueDateCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = React.useState(value)
  return (
    <div style={{ maxWidth: 170 }}>
      <CustomDatePicker value={v} onChange={(nv) => { setV(nv); onSave(nv) }} placeholder="期日未設定" />
    </div>
  )
}
