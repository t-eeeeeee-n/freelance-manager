// 給与所得控除テーブル（2026年時点。改正時に更新）
// [給与収入の上限, 率, 定額加算]
// 第1段（〜162.5万）は 率=0, 加算=550,000 の固定。
// 850万超（Infinity）は 率=0, 加算=1,950,000 の上限固定。
type Bracket = [number, number, number]
const SALARY_DEDUCTION_BRACKETS: readonly Bracket[] = [
  [1_625_000, 0,    550_000],   // 〜162.5万: 一律 55万
  [1_800_000, 0.40, -100_000],  // 〜180万:   収入×40%−10万
  [3_600_000, 0.30,  80_000],   // 〜360万:   収入×30%+8万
  [6_600_000, 0.20, 440_000],   // 〜660万:   収入×20%+44万
  [8_500_000, 0.10, 1_100_000], // 〜850万:   収入×10%+110万
  [Infinity,  0,    1_950_000], // 850万超:   上限 195万
]

/** 給与所得控除額（円整数）。 */
export function calcSalaryDeduction(salaryRevenue: number): number {
  for (const [upper, rate, add] of SALARY_DEDUCTION_BRACKETS) {
    if (salaryRevenue <= upper) {
      return rate === 0 ? add : Math.round(salaryRevenue * rate + add)
    }
  }
  return 1_950_000 // 到達しない（Infinity で必ず捕捉）
}

/** 給与所得 = max(給与収入 − 給与所得控除, 0)。 */
export function calcSalaryIncome(salaryRevenue: number): number {
  if (salaryRevenue <= 0) return 0
  return Math.max(salaryRevenue - calcSalaryDeduction(salaryRevenue), 0)
}
