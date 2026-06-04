import { describe, it, expect } from 'vitest'
import { calcWithholding } from './withholding'

describe('calcWithholding', () => {
  it('50万円・10.21% → 51,050', () => {
    expect(calcWithholding(500_000, 0.1021, 0.2042)).toBe(51_050)
  })
  it('ちょうど100万円 → 102,100', () => {
    expect(calcWithholding(1_000_000, 0.1021, 0.2042)).toBe(102_100)
  })
  it('150万円 → 100万×10.21% + 50万×20.42% = 204,200', () => {
    expect(calcWithholding(1_500_000, 0.1021, 0.2042)).toBe(204_200)
  })
  it('0円 → 0', () => {
    expect(calcWithholding(0, 0.1021, 0.2042)).toBe(0)
  })
  it('負の額 → 0', () => {
    expect(calcWithholding(-100, 0.1021, 0.2042)).toBe(0)
  })
  it('小数を含む額でも円整数に丸める', () => {
    expect(calcWithholding(123_456, 0.1021, 0.2042)).toBe(Math.round(123_456 * 0.1021))
  })
})
