import { describe, it, expect } from 'vitest'
import { buildMonthlySummary, buildAnnualRevenue } from './summary'
import type { Contract, WorkLog } from './types'

const contract = (over: Partial<Contract>): Contract => ({
  id: 'c1', client_id: 'cl1', name: '契約A', billing_type: 'hourly',
  minimum_hours: null, base_hourly_rate: 5000, overtime_hourly_rate: null,
  fixed_amount: null, start_date: '2026-01-01', end_date: null, is_active: true, withholding: false, ...over,
})

const log = (over: Partial<WorkLog>): WorkLog => ({
  id: 'w1', client_id: 'cl1', contract_id: 'c1', work_date: '2026-06-10',
  planned_hours: null, actual_hours: 10,
  actual_start_time: null, actual_end_time: null, break_minutes: 0,
  memo: null, status: 'worked', ...over,
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

  it('複数契約: 期間外 fixed は0、hourly のみ totalBilling に寄与する', () => {
    const c1 = contract({ id: 'c1', client_id: 'cl1', billing_type: 'hourly', base_hourly_rate: 5000 })
    const c2 = contract({
      id: 'c2', client_id: 'cl2', billing_type: 'fixed', fixed_amount: 200000,
      base_hourly_rate: null, start_date: '2026-07-01', end_date: '2026-12-31',
    })
    const res = buildMonthlySummary('2026-06', [c1, c2], [
      log({ id: 'w1', contract_id: 'c1', client_id: 'cl1', actual_hours: 10, work_date: '2026-06-15' }),
    ], 0)
    expect(res.rows).toHaveLength(2)
    const row2 = res.rows.find((r) => r.contractId === 'c2')!
    expect(row2.amount).toBe(0)
    expect(res.totalBilling).toBe(50000)
  })

  it('期間境界inclusive: end_date が月初と同日の契約は期間内', () => {
    const c = contract({
      billing_type: 'fixed', fixed_amount: 200000, base_hourly_rate: null,
      start_date: '2026-01-01', end_date: '2026-06-01',
    })
    const res = buildMonthlySummary('2026-06', [c], [], 0)
    expect(res.rows[0].amount).toBe(200000)
  })

  it('open-ended契約 (start/end null) は常に期間内', () => {
    const c = contract({ start_date: null, end_date: null })
    const res = buildMonthlySummary('2026-06', [c], [
      log({ actual_hours: 10, work_date: '2026-06-10' }),
    ], 0)
    expect(res.rows[0].amount).toBe(50000)
  })
})

describe('buildAnnualRevenue', () => {
  const hourly: Contract = {
    id: 'c1', client_id: 'cl1', name: '時給契約', billing_type: 'hourly',
    minimum_hours: null, base_hourly_rate: 5000, overtime_hourly_rate: null,
    fixed_amount: null, start_date: null, end_date: null, is_active: true, withholding: false,
  }
  const log = (id: string, date: string, hours: number): WorkLog => ({
    id, client_id: 'cl1', contract_id: 'c1', work_date: date,
    planned_hours: null, actual_hours: hours,
    actual_start_time: null, actual_end_time: null, break_minutes: 0,
    memo: null, status: 'worked',
  })

  it('対象年の12ヶ月分の請求を合算する', () => {
    const logs = [log('w1', '2026-01-10', 10), log('w2', '2026-07-20', 20)]
    // 1月: 10h*5000=50,000 / 7月: 20h*5000=100,000 → 150,000
    expect(buildAnnualRevenue(2026, [hourly], logs)).toBe(150_000)
  })

  it('対象年以外の稼働は含めない', () => {
    const logs = [log('w1', '2025-12-31', 10), log('w2', '2027-01-01', 10)]
    expect(buildAnnualRevenue(2026, [hourly], logs)).toBe(0)
  })
})
