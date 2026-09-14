/**
 * 年月（'YYYY-MM'）・日付（'YYYY-MM-DD'）の共通ヘルパー。
 * 月別表示を持つ画面（稼働ログ／経費／月次サマリー／ダッシュボード）で共有する。
 *
 * 「今日」「今月」は必ずここ経由で取得すること。
 * new Date().toISOString() はUTC基準のため、JSTの0〜9時に前日・前月を返してしまう。
 * new Date().getFullYear() 等のローカルタイムも、実行環境のTZ（Vercelは既定UTC）に依存する。
 */

/**
 * アプリの基準タイムゾーン。稼働日・請求日・入金日はすべて日本時間で判定する。
 * 環境変数TZに頼らないのは、サーバー／ブラウザ／CIでTZが揃わず、
 * SSRとクライアントで日付がずれてハイドレーション差異を起こすため。
 */
export const APP_TIMEZONE = 'Asia/Tokyo'

const ymdFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Date → 'YYYY-MM-DD'（日本時間基準） */
export function toYMD(d: Date): string {
  const p: Record<string, string> = {}
  for (const { type, value } of ymdFormatter.formatToParts(d)) p[type] = value
  return `${p.year}-${p.month}-${p.day}`
}

/** 今日の日付 'YYYY-MM-DD'（日本時間） */
export function todayYMD(): string {
  return toYMD(new Date())
}

/** 今月 'YYYY-MM'（日本時間） */
export function currentYm(): string {
  return todayYMD().slice(0, 7)
}

/** 今年（日本時間） */
export function currentYear(): number {
  return Number(todayYMD().slice(0, 4))
}

/** 年月をnヶ月ずらす。'2026-01' + (-1) → '2025-12' */
export function shiftYm(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function prevYm(ym: string): string { return shiftYm(ym, -1) }
export function nextYm(ym: string): string { return shiftYm(ym, 1) }

/** '2026-09' → '2026年9月' */
export function ymLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}年${Number(m)}月`
}

/** '2026-09-03' → '9/3(木)' */
export function dateLabel(ymd: string): string {
  const t = new Date(ymd + 'T00:00')
  const w = '日月火水木金土'[t.getDay()]
  return `${t.getMonth() + 1}/${t.getDate()}(${w})`
}

/** 年月の初日・末日。'2026-02' → { start: '2026-02-01', end: '2026-02-28' } */
export function monthRange(ym: string): { start: string; end: string } {
  const lastDay = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()
  return { start: `${ym}-01`, end: `${ym}-${String(lastDay).padStart(2, '0')}` }
}
