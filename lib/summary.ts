import type { Contract, WorkLog, BillingType } from './types'
import { calculateBilling } from './billing'

export interface SummaryRow {
  clientId: string
  contractId: string
  contractName: string
  billingType: BillingType
  workedHours: number
  minimumHours: number | null
  billableHours: number | null
  baseRate: number | null
  overtimeRate: number | null
  amount: number
}

export interface MonthlySummary {
  yearMonth: string
  rows: SummaryRow[]
  totalBilling: number
  expenseTotal: number
}

/** yearMonth: 'YYYY-MM'。work_date / start_date / end_date は 'YYYY-MM-DD'。 */
function isMonthWithinPeriod(yearMonth: string, start: string | null, end: string | null): boolean {
  const monthStart = `${yearMonth}-01`
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate()
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`
  if (start && start > monthEnd) return false
  if (end && end < monthStart) return false
  return true
}

export function buildMonthlySummary(
  yearMonth: string,
  contracts: Contract[],
  workLogs: WorkLog[],
  expenseTotal: number,
): MonthlySummary {
  const rows: SummaryRow[] = contracts.map((c) => {
    const workedHours = workLogs
      .filter((w) => w.contract_id === c.id && w.work_date.slice(0, 7) === yearMonth)
      .reduce((sum, w) => sum + (w.actual_hours ?? 0), 0)

    const billing = calculateBilling({
      billingType: c.billing_type,
      workedHours,
      minimumHours: c.minimum_hours,
      baseHourlyRate: c.base_hourly_rate,
      overtimeHourlyRate: c.overtime_hourly_rate,
      fixedAmount: c.fixed_amount,
      isWithinContractPeriod: isMonthWithinPeriod(yearMonth, c.start_date, c.end_date),
    })

    return {
      clientId: c.client_id,
      contractId: c.id,
      contractName: c.name,
      billingType: c.billing_type,
      workedHours,
      minimumHours: c.minimum_hours,
      billableHours: billing.billableHours,
      baseRate: c.base_hourly_rate,
      overtimeRate: c.overtime_hourly_rate,
      amount: billing.amount,
    }
  })

  const totalBilling = rows.reduce((sum, r) => sum + r.amount, 0)
  return { yearMonth, rows, totalBilling, expenseTotal }
}
