import { createClient } from '@/lib/supabase/server'
import { InvoicesTable, type InvoiceRow } from './invoices-table'

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_no, year_month, issue_date, total_amount, consumption_tax, withholding_amount, status, paid_date, due_date, memo, clients(name)')
    .order('created_at', { ascending: false })

  const invoices = (data ?? []) as unknown as InvoiceRow[]

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>請求書履歴</h1><p>発行済みの請求書と入金状況</p></div>
      </div>
      <InvoicesTable invoices={invoices} />
    </div>
  )
}
