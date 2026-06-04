import { describe, it, expect } from 'vitest'
import { nextInvoiceNo } from './invoice-number'

describe('nextInvoiceNo', () => {
  it('同一年月の既存なし → 001', () => {
    expect(nextInvoiceNo('2026-06', [])).toBe('2026-06-001')
  })
  it('2件存在 → 003', () => {
    expect(nextInvoiceNo('2026-06', ['2026-06-001', '2026-06-002'])).toBe('2026-06-003')
  })
  it('異なる年月は無視', () => {
    expect(nextInvoiceNo('2026-06', ['2026-05-010'])).toBe('2026-06-001')
  })
  it('連番は3桁ゼロパディング', () => {
    expect(nextInvoiceNo('2026-06', ['2026-06-009'])).toBe('2026-06-010')
  })
  it('99件存在 → 100（3桁超え）', () => {
    const existing = Array.from({ length: 99 }, (_, i) =>
      `2026-06-${String(i + 1).padStart(3, '0')}`)
    expect(nextInvoiceNo('2026-06', existing)).toBe('2026-06-100')
  })
})
