import { createClient } from '@/lib/supabase/server'

interface InvoiceRow {
  id: string
  invoice_no: string
  year_month: string
  issue_date: string
  total_amount: number
  memo: string | null
  clients: { name: string } | null
}

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_no, year_month, issue_date, total_amount, memo, clients(name)')
    .order('created_at', { ascending: false })

  const invoices = (data ?? []) as unknown as InvoiceRow[]
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
                  <td className="num" style={{ fontWeight: 600 }}>{inv.invoice_no}</td>
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
