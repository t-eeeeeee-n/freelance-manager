import { describe, it, expect } from 'vitest'
import { progressiveIncomeTax, calculateTax, DEFAULT_TAX_PARAMS } from './tax'
import { calcSalaryIncome, calcSalaryDeduction } from './salary'

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

  it('源泉0（未指定）なら Phase3 と同一の取り置き（後方互換）', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.withholding).toBe(0)
    expect(r.incomeTaxDue).toBe(r.incomeTax)
    expect(r.incomeTaxRefund).toBe(0)
    expect(r.reserve.monthlyReserve).toBe(103_528) // 税保険合計/12（源泉なし）
  })

  it('源泉 < 所得税 → 追加納付あり・取り置きが源泉分だけ減る', () => {
    const base = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    const wh = 100_000
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, annualWithholding: wh, params: DEFAULT_TAX_PARAMS })
    expect(r.withholding).toBe(wh)
    expect(r.incomeTaxRefund).toBe(0)
    expect(r.incomeTaxDue).toBe(base.incomeTax - wh)
    expect(r.reserve.monthlyReserve).toBe(Math.round((base.totalTaxAndInsurance - wh) / 12))
  })

  it('源泉 > 所得税 → 還付見込みあり', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, annualWithholding: 5_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.incomeTaxRefund).toBe(5_000_000 - r.incomeTax)
    expect(r.incomeTaxDue).toBe(0)
  })

  it('取り置きは源泉が税保険合計を超えても0未満にならない', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, annualWithholding: 99_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.reserve.monthlyReserve).toBe(0)
    expect(r.reserve.reserveRate).toBe(0)
  })

  it('売上0は源泉が渡っても全て0（ゲート維持）', () => {
    const r = calculateTax({ annualRevenue: 0, annualExpense: 0, annualWithholding: 50_000, params: DEFAULT_TAX_PARAMS })
    expect(r.withholding).toBe(0)
    expect(r.incomeTaxDue).toBe(0)
    expect(r.incomeTaxRefund).toBe(0)
  })
})

describe('calculateTax — 給与ありモード（副業）', () => {
  const p = DEFAULT_TAX_PARAMS

  it('employmentType 省略 → 専業モードと同一（後方互換）', () => {
    const a = calculateTax({ annualRevenue: 3_000_000, annualExpense: 500_000, params: p })
    const b = calculateTax({ annualRevenue: 3_000_000, annualExpense: 500_000, params: p, employmentType: 'freelance' })
    expect(a.incomeTax).toBe(b.incomeTax)
    expect(a.nationalPension).toBe(b.nationalPension)
    expect(a.totalTaxAndInsurance).toBe(b.totalTaxAndInsurance)
    expect(a.salaryIncome).toBe(0)
    expect(a.salaryDeduction).toBe(0)
    expect(a.salaryEarnings).toBe(0)
  })

  it('給与ありモード: 国保・年金は 0', () => {
    const r = calculateTax({
      annualRevenue: 1_000_000, annualExpense: 200_000, params: p,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    expect(r.nationalPension).toBe(0)
    expect(r.healthInsurance).toBe(0)
    expect(r.socialInsuranceDeduction).toBe(0)
  })

  it('給与ありモード: salaryEarnings を TaxResult に返す', () => {
    const r = calculateTax({
      annualRevenue: 1_000_000, annualExpense: 200_000, params: p,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    expect(r.salaryIncome).toBe(5_000_000)
    expect(r.salaryDeduction).toBe(calcSalaryDeduction(5_000_000))  // 1,440,000
    expect(r.salaryEarnings).toBe(calcSalaryIncome(5_000_000))      // 3,560,000
  })

  it('給与ありモード: 住民税は事業所得×residentTaxRateのみ（均等割なし）', () => {
    // 副業売上100万・経費20万・青色65万 → 事業所得15万
    const r = calculateTax({
      annualRevenue: 1_000_000, annualExpense: 200_000, params: p,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    const businessIncome = Math.max(1_000_000 - 200_000 - 650_000, 0)  // 150,000
    expect(r.residentTax).toBe(Math.round(businessIncome * p.residentTaxRate))  // 15,000（均等割 5,000 は含まない）
    expect(r.residentTax).toBe(15_000)
  })

  it('給与ありモード: 所得税は合算課税所得の限界税率差分', () => {
    // 給与500万・副業売上100万・経費20万・青色65万 → 事業所得15万
    // 給与所得: 3,560,000。給与社保概算: round(5,000,000*0.1415)=707,500
    // 給与のみ課税所得: max(3,560,000-707,500-480,000,0) = 2,372,500
    // 合算課税所得: max(3,560,000+150,000-707,500-480,000,0) = 2,522,500
    const sEarnings = calcSalaryIncome(5_000_000)    // 3,560,000
    const salaryIns = Math.round(5_000_000 * 0.1415)  // 707,500
    const biz = Math.max(1_000_000 - 200_000 - 650_000, 0)  // 150,000
    const taxableTotal   = Math.max(sEarnings + biz - salaryIns - p.basicDeductionIncome - p.otherDeductions, 0)
    const taxableSalOnly = Math.max(sEarnings - salaryIns - p.basicDeductionIncome, 0)
    const expectedTax = Math.max(
      Math.round(progressiveIncomeTax(taxableTotal) * 1.021) -
      Math.round(progressiveIncomeTax(taxableSalOnly) * 1.021),
      0,
    )
    const r = calculateTax({
      annualRevenue: 1_000_000, annualExpense: 200_000, params: p,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    expect(r.incomeTax).toBe(expectedTax)
    expect(r.incomeTax).toBeGreaterThan(0)
  })

  it('給与ありモード: 事業所得0→全て0（ゲート維持）', () => {
    const r = calculateTax({
      annualRevenue: 0, annualExpense: 0, params: p,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    expect(r.totalTaxAndInsurance).toBe(0)
    expect(r.incomeTax).toBe(0)
    expect(r.nationalPension).toBe(0)
    expect(r.salaryIncome).toBe(0)
  })

  it('給与ありモード: netIncome = 売上 − 経費 − (追加所得税 + 追加住民税)', () => {
    const r = calculateTax({
      annualRevenue: 1_000_000, annualExpense: 200_000, params: p,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    expect(r.netIncome).toBe(1_000_000 - 200_000 - r.totalTaxAndInsurance)
  })
})
