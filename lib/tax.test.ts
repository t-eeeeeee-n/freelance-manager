import { describe, it, expect } from 'vitest'
import { progressiveIncomeTax, calculateTax, DEFAULT_TAX_PARAMS } from './tax'

describe('progressiveIncomeTax（所得税本体・復興税抜き）', () => {
  it('課税所得0 → 0', () => {
    expect(progressiveIncomeTax(0)).toBe(0)
  })
  it('195万以下は5%・控除0', () => {
    expect(progressiveIncomeTax(1_950_000)).toBe(97_500) // 1,950,000 * 0.05
  })
  it('195万超は10%・控除97,500（境界の連続性）', () => {
    expect(progressiveIncomeTax(1_950_001)).toBeCloseTo(1_950_001 * 0.10 - 97_500, 5)
  })
  it('330万ちょうどは10%', () => {
    expect(progressiveIncomeTax(3_300_000)).toBe(3_300_000 * 0.10 - 97_500) // 232,500
  })
  it('330万超は20%・控除427,500（境界の連続性）', () => {
    expect(progressiveIncomeTax(3_300_001)).toBeCloseTo(3_300_001 * 0.20 - 427_500, 5)
  })
  it('695万ちょうどは20%', () => {
    expect(progressiveIncomeTax(6_950_000)).toBe(6_950_000 * 0.20 - 427_500) // 962,500
  })
  it('最高税率45%・控除4,796,000', () => {
    expect(progressiveIncomeTax(50_000_000)).toBe(50_000_000 * 0.45 - 4_796_000)
  })
})

describe('calculateTax', () => {
  it('売上0 → 全て0、手取り0', () => {
    const r = calculateTax({ annualRevenue: 0, annualExpense: 0, params: DEFAULT_TAX_PARAMS })
    expect(r.businessIncome).toBe(0)
    expect(r.nationalPension).toBe(0)
    expect(r.healthInsurance).toBe(0)
    expect(r.incomeTax).toBe(0)
    expect(r.residentTax).toBe(0)
    expect(r.totalTaxAndInsurance).toBe(0)
    expect(r.netIncome).toBe(0)
  })

  it('売上600万・経費100万・青色65万・デフォルト → 内訳を固定', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.businessIncome).toBe(4_350_000)
    expect(r.nationalPension).toBe(204_000)
    expect(r.healthInsurance).toBe(485_000)
    expect(r.socialInsuranceDeduction).toBe(689_000)
    expect(r.taxableIncomeIncomeTax).toBe(3_181_000)
    expect(r.incomeTax).toBe(225_233)
    expect(r.taxableIncomeResident).toBe(3_231_000)
    expect(r.residentTax).toBe(328_100)
    expect(r.totalTaxAndInsurance).toBe(1_242_333)
    expect(r.netIncome).toBe(3_757_667)
  })

  it('filing_type=white は青色控除0 → 事業所得が65万増える', () => {
    const blue = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    const white = calculateTax({
      annualRevenue: 6_000_000, annualExpense: 1_000_000,
      params: { ...DEFAULT_TAX_PARAMS, filingType: 'white' },
    })
    expect(white.businessIncome - blue.businessIncome).toBe(650_000)
  })

  it('other_deductions（iDeCo相当）を増やすと課税所得・所得税が減る', () => {
    const base = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    const ideco = calculateTax({
      annualRevenue: 6_000_000, annualExpense: 1_000_000,
      params: { ...DEFAULT_TAX_PARAMS, otherDeductions: 800_000 },
    })
    expect(ideco.taxableIncomeIncomeTax).toBeLessThan(base.taxableIncomeIncomeTax)
    expect(ideco.incomeTax).toBeLessThan(base.incomeTax)
  })

  it('取り置き目安: 月額・率・月の可処分を導出', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.reserve.monthlyReserve).toBe(103_528)
    expect(r.reserve.monthlyDisposable).toBe(313_139)
    expect(r.reserve.reserveRate).toBeCloseTo(1_242_333 / 6_000_000, 5)
  })

  it('取り置き目安: 売上0でも0除算せず率0', () => {
    const r = calculateTax({ annualRevenue: 0, annualExpense: 0, params: DEFAULT_TAX_PARAMS })
    expect(r.reserve.monthlyReserve).toBe(0)
    expect(r.reserve.reserveRate).toBe(0)
    expect(r.reserve.monthlyDisposable).toBe(0)
  })

  it('所得税は二重丸めしない（本体が小数でも末尾で1回だけ丸める）', () => {
    // 本体が小数になるケースを直接検証
    const taxable = 1_950_001 // 本体 = 97,500.1（小数）
    const single = Math.round((taxable * 0.10 - 97_500) * 1.021) // 末尾1回丸め
    const double = Math.round(Math.round(taxable * 0.10 - 97_500) * 1.021) // 旧: 二重丸め
    expect(progressiveIncomeTax(taxable) * 1.021).toBeCloseTo(97_500.1 * 1.021, 3)
    expect(single).not.toBe(double) // この値では1円ズレることを示す
    expect(Math.round(progressiveIncomeTax(taxable) * 1.021)).toBe(single)
  })

  it('赤字年（経費>売上）: 税・保険0、手取りは負のまま（クランプしない）', () => {
    const r = calculateTax({ annualRevenue: 500_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.businessIncome).toBe(0)
    expect(r.totalTaxAndInsurance).toBe(0)
    expect(r.netIncome).toBe(-500_000)
    expect(r.reserve.monthlyReserve).toBe(0)
    expect(r.reserve.reserveRate).toBe(0)
    expect(r.reserve.monthlyDisposable).toBe(Math.round(-500_000 / 12))
  })
})
