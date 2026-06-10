import { describe, it, expect } from 'vitest'
import { calcSalaryIncome, calcSalaryDeduction } from './salary'

describe('calcSalaryDeduction（給与所得控除額）', () => {
  it('0円 → 控除 550,000（下限）', () => {
    expect(calcSalaryDeduction(0)).toBe(550_000)
  })
  it('1,625,000円 → 控除 550,000（第1段上限）', () => {
    expect(calcSalaryDeduction(1_625_000)).toBe(550_000)
  })
  it('1,625,001円 → 控除 40%−10万（第2段）', () => {
    expect(calcSalaryDeduction(1_625_001)).toBe(Math.round(1_625_001 * 0.4 - 100_000))
  })
  it('1,800,000円 → 控除 620,000', () => {
    expect(calcSalaryDeduction(1_800_000)).toBe(620_000)
  })
  it('1,800,001円 → 控除 30%+8万（第3段）', () => {
    expect(calcSalaryDeduction(1_800_001)).toBe(Math.round(1_800_001 * 0.3 + 80_000))
  })
  it('3,000,000円 → 控除 980,000', () => {
    expect(calcSalaryDeduction(3_000_000)).toBe(980_000)
  })
  it('3,600,000円 → 控除 1,160,000（第3段上限）', () => {
    expect(calcSalaryDeduction(3_600_000)).toBe(1_160_000) // 3,600,000*0.3+80,000
  })
  it('3,600,001円 → 控除 20%+44万（第4段）', () => {
    expect(calcSalaryDeduction(3_600_001)).toBe(Math.round(3_600_001 * 0.2 + 440_000))
  })
  it('5,000,000円 → 控除 1,440,000', () => {
    expect(calcSalaryDeduction(5_000_000)).toBe(1_440_000)
  })
  it('6,600,000円 → 控除 1,760,000（第4段上限）', () => {
    expect(calcSalaryDeduction(6_600_000)).toBe(1_760_000) // 6,600,000*0.2+440,000
  })
  it('6,600,001円 → 控除 10%+110万（第5段）', () => {
    expect(calcSalaryDeduction(6_600_001)).toBe(Math.round(6_600_001 * 0.1 + 1_100_000))
  })
  it('8,500,000円 → 控除 1,950,000（上限到達）', () => {
    expect(calcSalaryDeduction(8_500_000)).toBe(1_950_000)
  })
  it('10,000,000円 → 控除 1,950,000（上限維持）', () => {
    expect(calcSalaryDeduction(10_000_000)).toBe(1_950_000)
  })
})

describe('calcSalaryIncome（給与所得）', () => {
  it('0円 → 給与所得 0', () => {
    expect(calcSalaryIncome(0)).toBe(0)
  })
  it('1,000,000円 → 給与所得 450,000', () => {
    expect(calcSalaryIncome(1_000_000)).toBe(450_000)
  })
  it('3,000,000円 → 給与所得 2,020,000', () => {
    expect(calcSalaryIncome(3_000_000)).toBe(2_020_000)
  })
  it('5,000,000円 → 給与所得 3,560,000', () => {
    expect(calcSalaryIncome(5_000_000)).toBe(3_560_000)
  })
  it('10,000,000円 → 給与所得 8,050,000', () => {
    expect(calcSalaryIncome(10_000_000)).toBe(8_050_000)
  })
})
