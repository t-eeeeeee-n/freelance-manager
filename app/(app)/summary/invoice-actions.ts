'use server'
import { createClient } from '@/lib/supabase/server'
import { buildMonthlySummary } from '@/lib/summary'
import { nextInvoiceNo } from '@/lib/invoice-number'
import { renderInvoicePdf } from '@/lib/pdf'
import { calcWithholding } from '@/lib/withholding'
import type { Contract, WorkLog } from '@/lib/types'

function composeBankInfo(p: { bank_name?: string | null; bank_branch?: string | null; account_type?: string | null; account_number?: string | null; account_holder?: string | null; bank_info?: string | null } | null): string | null {
  if (!p) return null
  const parts = [p.bank_name, p.bank_branch, p.account_type, p.account_number, p.account_holder].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  return p.bank_info ?? null  // legacy fallback
}

export async function generateInvoicePdf(clientId: string, yearMonth: string, memo?: string) {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return { error: '年月の形式が正しくありません' }
  const supabase = await createClient()

  const { data: profile } = await supabase.from('profile').select('*').limit(1).maybeSingle()
  const { data: clientData } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!clientData) return { error: 'クライアントが見つかりません' }

  const { data: taxSettings } = await supabase.from('tax_settings').select('withholding_rate, withholding_rate_high').limit(1).maybeSingle()
  const whRate = taxSettings?.withholding_rate ?? 0.1021
  const whRateHigh = taxSettings?.withholding_rate_high ?? 0.2042

  const monthStart = `${yearMonth}-01`
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate()
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`

  const [{ data: contracts }, { data: logs }] = await Promise.all([
    supabase.from('contracts').select('*').eq('client_id', clientId).eq('is_active', true),
    supabase.from('work_logs').select('*').eq('client_id', clientId).gte('work_date', monthStart).lte('work_date', monthEnd),
  ])

  const summary = buildMonthlySummary(yearMonth, (contracts ?? []) as Contract[], (logs ?? []) as WorkLog[], 0)
  // 金額が発生した行のみ請求書に載せる（¥0行は除外）
  const billableRows = summary.rows.filter(r => r.amount > 0)
  if (billableRows.length === 0) return { error: 'この月・クライアントの請求データがありません' }
  const totalAmount = billableRows.reduce((s, r) => s + r.amount, 0)

  const whContractIds = new Set(((contracts ?? []) as Contract[]).filter((c) => c.withholding).map((c) => c.id))
  const withholdingBase = billableRows.filter((r) => whContractIds.has(r.contractId)).reduce((s, r) => s + r.amount, 0)
  const withholdingAmount = calcWithholding(withholdingBase, whRate, whRateHigh)

  const { data: existingInvoices } = await supabase.from('invoices').select('invoice_no').eq('year_month', yearMonth)
  const existingNos = ((existingInvoices ?? []) as { invoice_no: string }[]).map(i => i.invoice_no)
  const invoiceNo = nextInvoiceNo(yearMonth, existingNos)
  const issueDate = new Date().toISOString().slice(0, 10)
  // 入金予定日の既定 = 翌月末
  const [iy, im] = issueDate.split('-').map(Number)
  const dueY = im === 12 ? iy + 1 : iy
  const dueM = im === 12 ? 1 : im + 1
  const dueLast = new Date(dueY, dueM, 0).getDate()
  const dueDate = `${dueY}-${String(dueM).padStart(2, '0')}-${String(dueLast).padStart(2, '0')}`

  const pdfBytes = await renderInvoicePdf({
    invoiceNo,
    issueDate,
    yearMonth,
    clientName: clientData.name,
    rows: billableRows,
    totalAmount,
    withholdingAmount,
    memo,
    profile: {
      display_name: profile?.display_name ?? null,
      address: [profile?.postal_code ? `〒${profile.postal_code}` : null, profile?.address]
        .filter(Boolean).join(' ') || null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      bank_info: composeBankInfo(profile),
    },
  })

  const { error: insertError } = await supabase.from('invoices').insert({
    invoice_no: invoiceNo,
    client_id: clientId,
    year_month: yearMonth,
    issue_date: issueDate,
    total_amount: totalAmount,
    withholding_amount: withholdingAmount,
    memo: memo ?? null,
    due_date: dueDate,
  })
  if (insertError) {
    console.error('invoices.insert failed', { code: insertError.code, message: insertError.message })
    return { error: '発行履歴の保存に失敗しました。もう一度お試しください' }
  }

  const base64 = Buffer.from(pdfBytes).toString('base64')
  return { error: null, base64, invoiceNo, filename: `invoice-${invoiceNo}.pdf` }
}
