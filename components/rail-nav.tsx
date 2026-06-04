'use client'
import React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from './icon'
import { signOut } from '@/app/(app)/actions'

const NAV = [
  { href: '/dashboard', label: 'ダッシュボード', icon: 'home' },
  { href: '/clients', label: 'クライアント', icon: 'users' },
  { href: '/contracts', label: '契約条件', icon: 'doc' },
  { href: '/work-logs', label: '稼働ログ', icon: 'clock' },
  { href: '/expenses', label: '経費', icon: 'wallet' },
  { href: '/summary', label: '月次サマリー', icon: 'chart' },
  { href: '/tax', label: '年間手取り試算', icon: 'calc' },
  { href: '/invoices', label: '請求書履歴', icon: 'copy' },
  { href: '/settings/profile', label: '設定', icon: 'edit' },
]

export function RailNav() {
  const path = usePathname()
  const [expanded, setExpanded] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('rail_expanded') === 'true'
  })

  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    localStorage.setItem('rail_expanded', String(next))
  }

  return (
    <nav className="rail" data-expanded={String(expanded)}>
      <div className="rail__mark">F</div>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className="railbtn"
          data-active={path.startsWith(n.href) ? 'true' : 'false'}
          aria-label={n.label}
        >
          <Icon name={n.icon} size={20} style={{ flexShrink: 0 }} />
          <span className="rail__label">{n.label}</span>
          {!expanded && <span className="tip">{n.label}</span>}
        </Link>
      ))}
      <div className="rail__foot">
        <form action={signOut}>
          <button type="submit" className="railbtn" aria-label="ログアウト">
            <Icon name="logout" size={20} style={{ flexShrink: 0 }} />
            <span className="rail__label">ログアウト</span>
            {!expanded && <span className="tip">ログアウト</span>}
          </button>
        </form>
      </div>

      {/* 右端中央の開閉タブ */}
      <button
        type="button"
        className="rail__toggle"
        onClick={toggle}
        aria-label={expanded ? 'サイドバーを閉じる' : 'サイドバーを開く'}
      >
        <Icon name={expanded ? 'chevL' : 'chevR'} size={13} />
      </button>
    </nav>
  )
}

export function MobileNav() {
  const path = usePathname()
  return (
    <nav className="mobnav">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} data-active={path.startsWith(n.href) ? 'true' : 'false'}>
          <Icon name={n.icon} size={19} />
          {n.label.slice(0, 4)}
        </Link>
      ))}
    </nav>
  )
}
