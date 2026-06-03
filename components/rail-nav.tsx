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
          <Icon name={n.icon} size={20} />
          <span className="rail__label">{n.label}</span>
          {!expanded && <span className="tip">{n.label}</span>}
        </Link>
      ))}
      <div className="rail__foot">
        <form action={signOut}>
          <button type="submit" className="railbtn" aria-label="ログアウト">
            <Icon name="logout" size={20} />
            <span className="rail__label">ログアウト</span>
            {!expanded && <span className="tip">ログアウト</span>}
          </button>
        </form>
        <button
          type="button"
          className="railbtn"
          onClick={toggle}
          aria-label={expanded ? 'サイドバーを閉じる' : 'サイドバーを開く'}
        >
          <Icon name={expanded ? 'chevL' : 'chevR'} size={18} />
          <span className="rail__label" style={{ fontSize: 11, color: 'var(--text-faint)' }}>閉じる</span>
          {!expanded && <span className="tip">展開</span>}
        </button>
      </div>
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
