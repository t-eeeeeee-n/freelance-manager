import { describe, it, expect } from 'vitest'
import { progressiveIncomeTax } from './tax'

describe('progressiveIncomeTax（所得税本体・復興税抜き）', () => {
  it('課税所得0 → 0', () => {
    expect(progressiveIncomeTax(0)).toBe(0)
  })
  it('195万以下は5%・控除0', () => {
    expect(progressiveIncomeTax(1_950_000)).toBe(97_500) // 1,950,000 * 0.05
  })
  it('195万超は10%・控除97,500（境界の連続性）', () => {
    expect(progressiveIncomeTax(1_950_001)).toBe(Math.round(1_950_001 * 0.10 - 97_500))
  })
  it('330万ちょうどは10%', () => {
    expect(progressiveIncomeTax(3_300_000)).toBe(3_300_000 * 0.10 - 97_500) // 232,500
  })
  it('330万超は20%・控除427,500（境界の連続性）', () => {
    expect(progressiveIncomeTax(3_300_001)).toBe(Math.round(3_300_001 * 0.20 - 427_500))
  })
  it('695万ちょうどは20%', () => {
    expect(progressiveIncomeTax(6_950_000)).toBe(6_950_000 * 0.20 - 427_500) // 962,500
  })
  it('最高税率45%・控除4,796,000', () => {
    expect(progressiveIncomeTax(50_000_000)).toBe(50_000_000 * 0.45 - 4_796_000)
  })
})
