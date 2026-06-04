import { describe, it, expect } from 'vitest'
import { buildAnnualProjection, buildMonthlyAmounts } from './projection'
import type { Contract, WorkLog } from './types'

function hourlyContract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', client_id: 'cl1', name: '時給', billing_type: 'hourly',
    minimum_hours: null, base_hourly_rate: 5000, overtime_hourly_rate: null,
    fixed_amount: null, start_date: null, end_date: null, is_active: true, withholding: false, ...over,
  }
}
function fixedContract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'f1', client_id: 'cl1', name: '固定', billing_type: 'fixed',
    minimum_hours: null, base_hourly_rate: null, overtime_hourly_rate: null,
    fixed_amount: 300000, start_date: null, end_date: null, is_active: true, withholding: false, ...over,
  }
}
function log(id: string, date: string, hours: number, contractId = 'c1'): WorkLog {
  return {
    id, client_id: 'cl1', contract_id: contractId, work_date: date,
    planned_hours: null, actual_hours: hours, actual_start_time: null, actual_end_time: null,
    break_minutes: 0, memo: null, status: 'worked',
  }
}

describe('buildAnnualProjection', () => {
  it('対象年が全て過去なら projected == actual', () => {
    const logs = [log('w1', '2025-03-10', 10), log('w2', '2025-09-10', 20)]
    const r = buildAnnualProjection(2025, [hourlyContract()], logs, '2026-06-15')
    expect(r.actual).toBe(150_000) // (10+20)*5000
    expect(r.projected).toBe(r.actual)
  })

  it('固定契約・年初(1月)時点 → 12ヶ月分を見込む', () => {
    const r = buildAnnualProjection(2026, [fixedContract()], [], '2026-01-01')
    expect(r.actual).toBe(0)
    expect(r.projected).toBe(3_600_000) // 300,000 * 12
  })

  it('時給契約・経過3ヶ月平均20h → 残9ヶ月を補完', () => {
    const logs = [log('w1', '2026-01-10', 20), log('w2', '2026-02-10', 20), log('w3', '2026-03-10', 20)]
    const r = buildAnnualProjection(2026, [hourlyContract()], logs, '2026-04-01')
    expect(r.actual).toBe(300_000)     // 3ヶ月 * 20h * 5000
    expect(r.projected).toBe(1_200_000) // 実績300,000 + 9ヶ月*100,000
  })

  it('契約期間外の月は見込みに含めない', () => {
    const r = buildAnnualProjection(2026, [fixedContract({ end_date: '2026-03-31' })], [], '2026-01-01')
    expect(r.projected).toBe(900_000) // 1-3月のみ 300,000*3
  })
})

describe('buildMonthlyAmounts', () => {
  it('源泉フラグと isActual を月×契約で返す', () => {
    const logs = [log('w1', '2026-01-10', 20)]
    const amts = buildMonthlyAmounts(2026, [hourlyContract({ withholding: true })], logs, '2026-02-01')
    const jan = amts.find((a) => a.ym === '2026-01')!
    const feb = amts.find((a) => a.ym === '2026-02')!
    expect(jan.isActual).toBe(true)
    expect(jan.amount).toBe(100_000)
    expect(jan.withholding).toBe(true)
    expect(feb.isActual).toBe(false)
  })
})
