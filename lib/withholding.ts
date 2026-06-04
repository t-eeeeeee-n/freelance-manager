// 源泉徴収の閾値（法令定数・改正時に更新）。100万円超の部分は高率。
export const WITHHOLDING_THRESHOLD = 1_000_000

/** 1回の支払額に対する源泉徴収税額。min(amount,閾値)*rate + max(amount-閾値,0)*rateHigh、円整数丸め。 */
export function calcWithholding(
  amount: number, rate: number, rateHigh: number, threshold = WITHHOLDING_THRESHOLD,
): number {
  if (amount <= 0) return 0
  const low = Math.min(amount, threshold) * rate
  const high = Math.max(amount - threshold, 0) * rateHigh
  return Math.round(low + high)
}
