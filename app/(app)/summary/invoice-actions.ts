'use server'
import { createClient } from '@/lib/supabase/server'
import { buildMonthlySummary } from '@/lib/summary'
import { nextInvoiceNo } from '@/lib/invoice-number'
import { renderInvoicePdf } from '@/lib/pdf'
import type { Contract, WorkLog } from '@/lib/types'

export async function generateInvoicePdf(clientId: string, yearMonth: string, memo?: string) {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return { error: '年月の形式が正しくありません' }
  const supabase = await createClient()

  const { data: profile } = await supabase.from('profile').select('*').limit(1).maybeSingle()
  const { data: clientData } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!clientData) return { error: 'クライアントが見つかりません' }

  const monthStart = `${yearMonth}-01`
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate()
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`

  const [{ data: contracts }, { data: logs }] = await Promise.all([
    supabase.from('contracts').select('*').eq('client_id', clientId).eq('is_active', true),
    supabase.from('work_logs').select('*').eq('client_id', clientId).gte('work_date', monthStart).lte('work_date', monthEnd),
  ])

  const summary = buildMonthlySummary(yearMonth, (contracts ?? []) as Contract[], (logs ?? []) as WorkLog[], 0)
  const billableRows = summary.rows.filter(r => r.amount > 0 || r.workedHours > 0)
  if (billableRows.length === 0) return { error: 'この月・クライアントの請求データがありません' }
  const totalAmount = billableRows.reduce((s, r) => s + r.amount, 0)

  const { data: existingInvoices } = await supabase.from('invoices').select('invoice_no').eq('year_month', yearMonth)
  const existingNos = ((existingInvoices ?? []) as { invoice_no: string }[]).map(i => i.invoice_no)
  const invoiceNo = nextInvoiceNo(yearMonth, existingNos)
  const issueDate = new Date().toISOString().slice(0, 10)

  const pdfBytes = await renderInvoicePdf({
    invoiceNo,
    issueDate,
    yearMonth,
    clientName: clientData.name,
    rows: billableRows,
    totalAmount,
    memo,
    profile: {
      display_name: profile?.display_name ?? null,
      address: profile?.address ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      bank_info: profile?.bank_info ?? null,
    },
  })

  const { error: insertError } = await supabase.from('invoices').insert({
    invoice_no: invoiceNo,
    client_id: clientId,
    year_month: yearMonth,
    issue_date: issueDate,
    total_amount: totalAmount,
    memo: memo ?? null,
  })
  if (insertError) return { error: '発行履歴の保存に失敗しました' }

  const base64 = Buffer.from(pdfBytes).toString('base64')
  return { error: null, base64, invoiceNo, filename: `invoice-${invoiceNo}.pdf` }
}
