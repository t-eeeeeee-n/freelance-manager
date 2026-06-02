import { describe, it, expect } from 'vitest'
import { calculateBilling } from './billing'

describe('calculateBilling', () => {
  it('hourly: 実働 × 単価', () => {
    const r = calculateBilling({
      billingType: 'hourly', workedHours: 80, baseHourlyRate: 5000,
      minimumHours: null, overtimeHourlyRate: null, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.amount).toBe(400000)
    expect(r.billableHours).toBe(80)
  })

  it('monthly_minimum (超過単価なし): 実働 < 最低 → 最低 × 単価', () => {
    const r = calculateBilling({
      billingType: 'monthly_minimum', workedHours: 80, minimumHours: 100, baseHourlyRate: 5000,
      overtimeHourlyRate: null, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.billableHours).toBe(100)
    expect(r.amount).toBe(500000)
  })

  it('monthly_minimum (超過単価なし): 実働 >= 最低 → 実働 × 単価', () => {
    const r = calculateBilling({
      billingType: 'monthly_minimum', workedHours: 120, minimumHours: 100, baseHourlyRate: 5000,
      overtimeHourlyRate: null, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.billableHours).toBe(120)
    expect(r.amount).toBe(600000)
  })

  it('monthly_minimum (超過単価あり): base*最低 + overtime*超過', () => {
    const r = calculateBilling({
      billingType: 'monthly_minimum', workedHours: 120, minimumHours: 100,
      baseHourlyRate: 5000, overtimeHourlyRate: 6000, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.amount).toBe(620000)
  })

  it('monthly_minimum (超過単価あり): 実働<最低なら超過分は0', () => {
    const r = calculateBilling({
      billingType: 'monthly_minimum', workedHours: 90, minimumHours: 100,
      baseHourlyRate: 5000, overtimeHourlyRate: 6000, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.amount).toBe(500000)
  })

  it('fixed: 契約期間内なら固定額', () => {
    const r = calculateBilling({
      billingType: 'fixed', fixedAmount: 300000, isWithinContractPeriod: true,
      workedHours: 0, minimumHours: null, baseHourlyRate: null, overtimeHourlyRate: null,
    })
    expect(r.amount).toBe(300000)
    expect(r.billableHours).toBeNull()
  })

  it('fixed: 契約期間外なら0', () => {
    const r = calculateBilling({
      billingType: 'fixed', fixedAmount: 300000, isWithinContractPeriod: false,
      workedHours: 0, minimumHours: null, baseHourlyRate: null, overtimeHourlyRate: null,
    })
    expect(r.amount).toBe(0)
  })

  it('小数時間は円整数に丸める', () => {
    const r = calculateBilling({
      billingType: 'hourly', workedHours: 7.5, baseHourlyRate: 3333,
      minimumHours: null, overtimeHourlyRate: null, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.amount).toBe(Math.round(7.5 * 3333))
  })
})
