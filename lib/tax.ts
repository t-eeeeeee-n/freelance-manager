import type { TaxFilingType } from './types'

export interface TaxParams {
  filingType: TaxFilingType
  blueDeduction: number
  basicDeductionIncome: number
  basicDeductionResident: number
  nationalPensionAnnual: number
  healthInsuranceRate: number
  healthInsuranceFixed: number
  residentTaxRate: number
  residentTaxFixed: number
  otherDeductions: number
}

export interface TaxInput {
  annualRevenue: number
  annualExpense: number
  params: TaxParams
}

export interface TaxResult {
  businessIncome: number            // 事業所得
  nationalPension: number           // 国民年金
  healthInsurance: number           // 国民健康保険
  socialInsuranceDeduction: number  // 社会保険料控除
  taxableIncomeIncomeTax: number    // 課税所得（所得税）
  incomeTax: number                 // 所得税（復興特別所得税込み）
  taxableIncomeResident: number     // 課税所得（住民税）
  residentTax: number               // 住民税
  totalTaxAndInsurance: number      // 税・保険合計
  netIncome: number                 // 手取り（年・可処分）
  reserve: {
    monthlyReserve: number     // 毎月の取り置き目安（税・保険合計 ÷ 12）
    reserveRate: number        // 取り置き率（税・保険合計 ÷ 売上、0〜1）
    monthlyDisposable: number  // 月に使っていい手取り（手取り ÷ 12）
  }
}

// スペック §4.7 のデフォルト値と一致させる
export const DEFAULT_TAX_PARAMS: TaxParams = {
  filingType: 'blue',
  blueDeduction: 650000,
  basicDeductionIncome: 480000,
  basicDeductionResident: 430000,
  nationalPensionAnnual: 204000,
  healthInsuranceRate: 0.10,
  healthInsuranceFixed: 50000,
  residentTaxRate: 0.10,
  residentTaxFixed: 5000,
  otherDeductions: 0,
}

// 所得税の累進税率テーブル（スペック §8・2026年時点の概算。改正時に更新）
// [上限, 税率, 控除額]。上限以下に該当する最初の段を使う。
const INCOME_TAX_BRACKETS: ReadonlyArray<[number, number, number]> = [
  [1_950_000, 0.05, 0],
  [3_300_000, 0.10, 97_500],
  [6_950_000, 0.20, 427_500],
  [9_000_000, 0.23, 636_000],
  [18_000_000, 0.33, 1_536_000],
  [40_000_000, 0.40, 2_796_000],
  [Infinity, 0.45, 4_796_000],
]

/** 復興特別所得税を含まない所得税本体。課税所得が0以下なら0。 */
export function progressiveIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0
  for (const [upper, rate, deduction] of INCOME_TAX_BRACKETS) {
    if (taxableIncome <= upper) {
      return Math.round(taxableIncome * rate - deduction)
    }
  }
  return 0 // 到達しない（Infinity で必ず捕捉）
}

/** スペック §8 の概算ロジック。事業所得が0なら税・保険は全て0（売上0→全て0）。 */
export function calculateTax(input: TaxInput): TaxResult {
  const { annualRevenue, annualExpense, params: p } = input

  const blue = p.filingType === 'blue' ? p.blueDeduction : 0
  const businessIncome = Math.max(annualRevenue - annualExpense - blue, 0)

  if (businessIncome === 0) {
    const netIncome = annualRevenue - annualExpense
    return {
      businessIncome: 0,
      nationalPension: 0,
      healthInsurance: 0,
      socialInsuranceDeduction: 0,
      taxableIncomeIncomeTax: 0,
      incomeTax: 0,
      taxableIncomeResident: 0,
      residentTax: 0,
      totalTaxAndInsurance: 0,
      netIncome,
      reserve: buildReserve(0, netIncome, annualRevenue),
    }
  }

  const nationalPension = p.nationalPensionAnnual
  const healthInsurance = Math.round(businessIncome * p.healthInsuranceRate) + p.healthInsuranceFixed
  const socialInsuranceDeduction = nationalPension + healthInsurance

  const taxableIncomeIncomeTax = Math.max(
    businessIncome - socialInsuranceDeduction - p.basicDeductionIncome - p.otherDeductions, 0,
  )
  const incomeTax = Math.round(progressiveIncomeTax(taxableIncomeIncomeTax) * 1.021) // 復興特別所得税

  const taxableIncomeResident = Math.max(
    businessIncome - socialInsuranceDeduction - p.basicDeductionResident - p.otherDeductions, 0,
  )
  const residentTax = Math.round(taxableIncomeResident * p.residentTaxRate) + p.residentTaxFixed

  const totalTaxAndInsurance = incomeTax + residentTax + nationalPension + healthInsurance
  const netIncome = annualRevenue - annualExpense - totalTaxAndInsurance

  return {
    businessIncome,
    nationalPension,
    healthInsurance,
    socialInsuranceDeduction,
    taxableIncomeIncomeTax,
    incomeTax,
    taxableIncomeResident,
    residentTax,
    totalTaxAndInsurance,
    netIncome,
    reserve: buildReserve(totalTaxAndInsurance, netIncome, annualRevenue),
  }
}

function buildReserve(totalTaxAndInsurance: number, netIncome: number, annualRevenue: number) {
  return {
    monthlyReserve: Math.round(totalTaxAndInsurance / 12),
    reserveRate: annualRevenue > 0 ? totalTaxAndInsurance / annualRevenue : 0,
    monthlyDisposable: Math.round(netIncome / 12),
  }
}
