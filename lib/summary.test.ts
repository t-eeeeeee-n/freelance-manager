import { describe, it, expect } from 'vitest'
import { buildMonthlySummary } from './summary'
import type { Contract, WorkLog } from './types'

const contract = (over: Partial<Contract>): Contract => ({
  id: 'c1', client_id: 'cl1', name: '契約A', billing_type: 'hourly',
  minimum_hours: null, base_hourly_rate: 5000, overtime_hourly_rate: null,
  fixed_amount: null, start_date: '2026-01-01', end_date: null, is_active: true, ...over,
})

const log = (over: Partial<WorkLog>): WorkLog => ({
  id: 'w1', client_id: 'cl1', contract_id: 'c1', work_date: '2026-06-10',
  planned_hours: null, actual_hours: 10, memo: null, status: 'worked', ...over,
})

describe('buildMonthlySummary', () => {
  it('対象月の実働を契約ごとに合計し請求額を出す', () => {
    const res = buildMonthlySummary('2026-06', [contract({})], [
      log({ id: 'w1', actual_hours: 10, work_date: '2026-06-01' }),
      log({ id: 'w2', actual_hours: 5, work_date: '2026-06-02' }),
    ], 0)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].workedHours).toBe(15)
    expect(res.rows[0].amount).toBe(75000)
    expect(res.totalBilling).toBe(75000)
  })

  it('対象月以外のログは除外する', () => {
    const res = buildMonthlySummary('2026-06', [contract({})], [
      log({ id: 'w1', actual_hours: 10, work_date: '2026-06-01' }),
      log({ id: 'w2', actual_hours: 99, work_date: '2026-05-31' }),
    ], 0)
    expect(res.rows[0].workedHours).toBe(10)
  })

  it('actual_hours が null のログは0として扱う', () => {
    const res = buildMonthlySummary('2026-06', [contract({})], [
      log({ id: 'w1', actual_hours: null }),
    ], 0)
    expect(res.rows[0].workedHours).toBe(0)
    expect(res.rows[0].amount).toBe(0)
  })

  it('fixed契約は対象月が契約期間内なら固定額', () => {
    const c = contract({ billing_type: 'fixed', fixed_amount: 200000, base_hourly_rate: null,
      start_date: '2026-06-01', end_date: '2026-12-31' })
    const res = buildMonthlySummary('2026-06', [c], [], 0)
    expect(res.rows[0].amount).toBe(200000)
    expect(res.totalBilling).toBe(200000)
  })

  it('fixed契約は契約期間外の月なら0かつ売上に含めない', () => {
    const c = contract({ billing_type: 'fixed', fixed_amount: 200000, base_hourly_rate: null,
      start_date: '2026-07-01', end_date: '2026-12-31' })
    const res = buildMonthlySummary('2026-06', [c], [], 0)
    expect(res.rows[0].amount).toBe(0)
    expect(res.totalBilling).toBe(0)
  })

  it('経費合計はそのまま別枠で返し、売上には影響しない', () => {
    const res = buildMonthlySummary('2026-06', [contract({})],
      [log({ actual_hours: 10 })], 123000)
    expect(res.expenseTotal).toBe(123000)
    expect(res.totalBilling).toBe(50000)
  })
})
