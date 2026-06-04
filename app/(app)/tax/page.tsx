import { createClient } from '@/lib/supabase/server'
import { buildAnnualProjection, buildMonthlyAmounts } from '@/lib/projection'
import { DEFAULT_TAX_PARAMS, type TaxParams } from '@/lib/tax'
import { calcWithholding } from '@/lib/withholding'
import type { Contract, WorkLog, Expense, TaxSettings } from '@/lib/types'
import { TaxUI } from './tax-ui'

function toParams(s: TaxSettings | null): TaxParams {
  if (!s) return DEFAULT_TAX_PARAMS
  return {
    filingType: s.filing_type,
    blueDeduction: s.blue_deduction,
    basicDeductionIncome: s.basic_deduction_income,
    basicDeductionResident: s.basic_deduction_resident,
    nationalPensionAnnual: s.national_pension_annual,
    healthInsuranceRate: s.health_insurance_rate,
    healthInsuranceFixed: s.health_insurance_fixed,
    residentTaxRate: s.resident_tax_rate,
    residentTaxFixed: s.resident_tax_fixed,
    otherDeductions: s.other_deductions,
  }
}

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const { y } = await searchParams
  const year = Number(y) || new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const supabase = await createClient()
  const [{ data: contracts }, { data: logs }, { data: expenses }, { data: settings }] = await Promise.all([
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('work_logs').select('*').gte('work_date', yearStart).lte('work_date', yearEnd),
    supabase.from('expenses').select('allocated_amount').gte('expense_date', yearStart).lte('expense_date', yearEnd),
    supabase.from('tax_settings').select('*').limit(1).maybeSingle(),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const projection = buildAnnualProjection(year, (contracts ?? []) as Contract[], (logs ?? []) as WorkLog[], today)
  const annualExpense = ((expenses ?? []) as Pick<Expense, 'allocated_amount'>[])
    .reduce((s, e) => s + (e.allocated_amount ?? 0), 0)

  const settingsParams = toParams((settings ?? null) as TaxSettings | null)
  const whRate = settings?.withholding_rate ?? 0.1021
  const whRateHigh = settings?.withholding_rate_high ?? 0.2042
  const amounts = buildMonthlyAmounts(year, (contracts ?? []) as Contract[], (logs ?? []) as WorkLog[], today)
  const withholdingActual = amounts
    .filter((a) => a.withholding && a.isActual)
    .reduce((s, a) => s + calcWithholding(a.amount, whRate, whRateHigh), 0)
  const withholdingProjected = amounts
    .filter((a) => a.withholding)
    .reduce((s, a) => s + calcWithholding(a.amount, whRate, whRateHigh), 0)

  return (
    <TaxUI
      year={year}
      actualRevenue={projection.actual}
      projectedRevenue={projection.projected}
      annualExpense={annualExpense}
      params={settingsParams}
      withholdingActual={withholdingActual}
      withholdingProjected={withholdingProjected}
    />
  )
}
