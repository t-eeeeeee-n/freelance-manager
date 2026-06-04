'use client'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './theme-provider'
import { Icon } from './icon'

const LABELS: Record<string, string> = {
  '/dashboard': 'ダッシュボード',
  '/clients': 'クライアント',
  '/contracts': '契約条件',
  '/work-logs': '稼働ログ',
  '/expenses': '経費',
  '/summary': '月次サマリー',
  '/invoices': '請求書履歴',
  '/settings/profile': '設定',
}
const DESCS: Record<string, string> = {
  '/dashboard': '今月の概況',
  '/clients': '業務委託先の管理',
  '/contracts': '請求条件の設定',
  '/work-logs': '日々の稼働記録',
  '/expenses': '経費と按分の管理',
  '/summary': '月次の請求集計',
  '/invoices': '発行済み請求書の一覧',
  '/settings/profile': '請求書の発行者情報',
}

export function Topstrip() {
  const path = usePathname()
  const key = Object.keys(LABELS).find((k) => path.startsWith(k)) || '/dashboard'
  return (
    <div className="topstrip">
      <div className="topstrip__crumb">
        <span>FreeDesk</span>
        <Icon name="chevR" size={13} />
        <b>{LABELS[key]}</b>
      </div>
      <span className="sub">{DESCS[key]}</span>
      <span className="spacer" />
      <ThemeToggle />
      <div className="avatar">私</div>
    </div>
  )
}
