'use client'
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
  return (
    <nav className="rail">
      <div className="rail__mark">F</div>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className="railbtn" data-active={path.startsWith(n.href) ? 'true' : 'false'} aria-label={n.label}>
          <Icon name={n.icon} size={20} />
          <span className="tip">{n.label}</span>
        </Link>
      ))}
      <div className="rail__foot">
        <form action={signOut}>
          <button type="submit" className="railbtn" aria-label="ログアウト">
            <Icon name="logout" size={20} />
            <span className="tip">ログアウト</span>
          </button>
        </form>
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
