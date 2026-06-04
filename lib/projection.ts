import type { Contract, WorkLog } from './types'
import { buildMonthlySummary, isMonthWithinPeriod } from './summary'

export interface MonthlyAmount {
  ym: string
  contractId: string
  withholding: boolean
  amount: number
  isActual: boolean
}

/** アクティブ契約の1ヶ月見込み額（契約期間外は0、円整数）。 */
export function estimateMonthly(contract: Contract, ym: string, recentAvgHours: number): number {
  if (!isMonthWithinPeriod(ym, contract.start_date, contract.end_date)) return 0
  switch (contract.billing_type) {
    case 'fixed':
      return Math.round(contract.fixed_amount ?? 0)
    case 'monthly_minimum':
      return Math.round(Math.max(contract.minimum_hours ?? 0, recentAvgHours) * (contract.base_hourly_rate ?? 0))
    case 'hourly':
      return Math.round(recentAvgHours * (contract.base_hourly_rate ?? 0))
  }
}

/** 月×契約の金額内訳。過去月=実績(buildMonthlySummary)、当月以降=契約からの見込み。 */
export function buildMonthlyAmounts(
  year: number, contracts: Contract[], workLogs: WorkLog[], today: string,
): MonthlyAmount[] {
  const todayY = Number(today.slice(0, 4))
  const todayM = Number(today.slice(5, 7))
  const elapsed = year < todayY ? 12 : year > todayY ? 0 : todayM - 1

  const recentAvg: Record<string, number> = {}
  for (const c of contracts) {
    const sum = workLogs
      .filter((w) => w.contract_id === c.id
        && w.work_date.slice(0, 4) === String(year)
        && Number(w.work_date.slice(5, 7)) <= elapsed)
      .reduce((s, w) => s + (w.actual_hours ?? 0), 0)
    recentAvg[c.id] = sum / Math.max(elapsed, 1)
  }

  const out: MonthlyAmount[] = []
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    const isPast = year < todayY || (year === todayY && m < todayM)
    if (isPast) {
      const summ = buildMonthlySummary(ym, contracts, workLogs, 0)
      for (const r of summ.rows) {
        const c = contracts.find((x) => x.id === r.contractId)
        out.push({ ym, contractId: r.contractId, withholding: c?.withholding ?? false, amount: r.amount, isActual: true })
      }
    } else {
      for (const c of contracts) {
        out.push({ ym, contractId: c.id, withholding: c.withholding, amount: estimateMonthly(c, ym, recentAvg[c.id]), isActual: false })
      }
    }
  }
  return out
}

/** 対象年（暦年）の年商。actual=過去月実績の合計、projected=実績+当月以降見込み。 */
export function buildAnnualProjection(
  year: number, contracts: Contract[], workLogs: WorkLog[], today: string,
): { actual: number; projected: number } {
  const amts = buildMonthlyAmounts(year, contracts, workLogs, today)
  const actual = amts.filter((a) => a.isActual).reduce((s, a) => s + a.amount, 0)
  const projected = amts.reduce((s, a) => s + a.amount, 0)
  return { actual, projected }
}
