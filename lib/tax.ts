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
  annualWithholding?: number
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
  withholding: number          // 源泉徴収合計（前払い所得税）
  incomeTaxDue: number         // 確定申告での追加納付（max(所得税 - 源泉, 0)）
  incomeTaxRefund: number      // 還付見込み（max(源泉 - 所得税, 0)）
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
  healthInsuranceRate: 0.10,    // 国保 所得比例分の率（自治体差大・概算）
  healthInsuranceFixed: 50000,  // 国保 均等割等の定額分（概算）
  residentTaxRate: 0.10,        // 住民税 所得割の率
  residentTaxFixed: 5000,       // 住民税 均等割（定額）
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

/** 所得税本体（端数処理前・復興特別所得税抜き）。課税所得が0以下なら0。 */
export function progressiveIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0
  for (const [upper, rate, deduction] of INCOME_TAX_BRACKETS) {
    if (taxableIncome <= upper) {
      return taxableIncome * rate - deduction
    }
  }
  return 0 // 到達しない（Infinity で必ず捕捉）
}

/** スペック §8 の概算ロジック。事業所得が0なら税・保険は全て0（売上0→全て0）。 */
export function calculateTax(input: TaxInput): TaxResult {
  const { annualRevenue, annualExpense, params: p } = input
  const withholding = input.annualWithholding ?? 0

  const blue = p.filingType === 'blue' ? p.blueDeduction : 0
  const businessIncome = Math.max(annualRevenue - annualExpense - blue, 0)

  if (businessIncome === 0) {
    // 赤字年（経費>売上）は手取りが負になりうる。損失の事実を表すため意図的にクランプしない。
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
      totalTaxAndInsurance: 0, netIncome,
      withholding: 0, incomeTaxDue: 0, incomeTaxRefund: 0,
      reserve: buildReserve(0, netIncome, annualRevenue, 0),
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

  const incomeTaxDue = Math.max(incomeTax - withholding, 0)
  const incomeTaxRefund = Math.max(withholding - incomeTax, 0)

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
    withholding,
    incomeTaxDue,
    incomeTaxRefund,
    reserve: buildReserve(totalTaxAndInsurance, netIncome, annualRevenue, withholding),
  }
}

function buildReserve(totalTaxAndInsurance: number, netIncome: number, annualRevenue: number, withholding: number) {
  const reserveBase = Math.max(totalTaxAndInsurance - withholding, 0)
  return {
    monthlyReserve: Math.round(reserveBase / 12),
    reserveRate: annualRevenue > 0 ? reserveBase / annualRevenue : 0,
    monthlyDisposable: Math.round(netIncome / 12),
  }
}
