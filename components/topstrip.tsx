'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './theme-provider'
import { Icon } from './icon'
import { signOut } from '@/app/(app)/actions'

const LABELS: Record<string, string> = {
  '/dashboard': 'ダッシュボード',
  '/clients': 'クライアント',
  '/contracts': '契約条件',
  '/work-logs': '稼働ログ',
  '/expenses': '経費',
  '/summary': '月次サマリー',
  '/invoices': '請求書履歴',
  '/settings/profile': '設定',
  '/settings/appearance': '設定',
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
  '/settings/appearance': '表示設定',
}

const personSvg = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)

export function Topstrip() {
  const path = usePathname()
  const key = Object.keys(LABELS).find((k) => path.startsWith(k)) || '/dashboard'
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!menuOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

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
      <div className="avmenu" ref={menuRef}>
        <button
          className="avmenu__btn"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="アカウントメニュー"
          aria-expanded={menuOpen}
        >
          {personSvg}
        </button>
        {menuOpen && (
          <div className="avmenu__list">
            <Link href="/settings/profile" className="avmenu__item" onClick={() => setMenuOpen(false)}>
              <Icon name="edit" size={15} />設定
            </Link>
            <form action={signOut}>
              <button type="submit" className="avmenu__item">
                <Icon name="logout" size={15} />ログアウト
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
