import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  APP_TIMEZONE, toYMD, todayYMD, currentYm, currentYear,
  shiftYm, prevYm, nextYm, ymLabel, dateLabel, monthRange,
} from './ym'

afterEach(() => { vi.useRealTimers() })

describe('APP_TIMEZONE', () => {
  it('日本時間で固定されている', () => {
    expect(APP_TIMEZONE).toBe('Asia/Tokyo')
  })
})

describe('toYMD', () => {
  it('UTC時刻をJSTの日付に変換する', () => {
    // 2026-09-02T16:00Z = JST 2026-09-03 01:00
    expect(toYMD(new Date('2026-09-02T16:00:00Z'))).toBe('2026-09-03')
  })
  it('ゼロパディングして返す', () => {
    expect(toYMD(new Date('2026-09-03T12:00:00+09:00'))).toBe('2026-09-03')
  })
  it('年末をまたぐ（UTC 12/31 夜 → JST 翌年1/1）', () => {
    expect(toYMD(new Date('2026-12-31T15:30:00Z'))).toBe('2027-01-01')
  })
})

// 実行環境のTZに関わらずJST基準で返ることを担保する。
// 旧実装（toISOString / ローカルタイム）はこれらのケースで前日・前月を返していた。
describe('todayYMD / currentYm / currentYear（TZ非依存）', () => {
  it('JST月初の0時台でも当月を返す（UTCでは前月末）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:30:00+09:00'))
    expect(todayYMD()).toBe('2026-09-01')
    expect(currentYm()).toBe('2026-09')
  })
  it('JST元日の0時台でも新年を返す（UTCでは前年末）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-01T00:30:00+09:00'))
    expect(todayYMD()).toBe('2027-01-01')
    expect(currentYm()).toBe('2027-01')
    expect(currentYear()).toBe(2027)
  })
  it('JST日中は素直にその日を返す', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T15:00:00+09:00'))
    expect(todayYMD()).toBe('2026-09-14')
    expect(currentYear()).toBe(2026)
  })
})

describe('shiftYm', () => {
  it('翌月', () => {
    expect(shiftYm('2026-09', 1)).toBe('2026-10')
  })
  it('前月', () => {
    expect(shiftYm('2026-09', -1)).toBe('2026-08')
  })
  it('年をまたぐ（1月の前月 → 前年12月）', () => {
    expect(shiftYm('2026-01', -1)).toBe('2025-12')
  })
  it('年をまたぐ（12月の翌月 → 翌年1月）', () => {
    expect(shiftYm('2026-12', 1)).toBe('2027-01')
  })
  it('複数月まとめてずらす', () => {
    expect(shiftYm('2026-09', -12)).toBe('2025-09')
  })
  it('0はそのまま', () => {
    expect(shiftYm('2026-09', 0)).toBe('2026-09')
  })
})

describe('prevYm / nextYm', () => {
  it('prevYmは1ヶ月前', () => {
    expect(prevYm('2026-01')).toBe('2025-12')
  })
  it('nextYmは1ヶ月後', () => {
    expect(nextYm('2026-12')).toBe('2027-01')
  })
})

describe('ymLabel', () => {
  it('月のゼロパディングを外す', () => {
    expect(ymLabel('2026-09')).toBe('2026年9月')
  })
  it('2桁月', () => {
    expect(ymLabel('2026-12')).toBe('2026年12月')
  })
})

describe('dateLabel', () => {
  it('曜日付きで返す', () => {
    expect(dateLabel('2026-09-03')).toBe('9/3(木)')
  })
  it('日曜', () => {
    expect(dateLabel('2026-09-06')).toBe('9/6(日)')
  })
  it('ゼロパディングを外す', () => {
    expect(dateLabel('2026-01-01')).toBe('1/1(木)')
  })
})

describe('monthRange', () => {
  it('31日の月', () => {
    expect(monthRange('2026-01')).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })
  it('30日の月', () => {
    expect(monthRange('2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })
  it('平年の2月', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
  it('閏年の2月', () => {
    expect(monthRange('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })
})
