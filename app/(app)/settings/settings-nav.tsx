'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/settings/profile', label: 'プロフィール' },
  { href: '/settings/appearance', label: '外観' },
]

export function SettingsNav() {
  const path = usePathname()
  return (
    <div className="ctabs">
      {TABS.map(t => (
        <Link key={t.href} href={t.href} className="ctab" data-active={String(path.startsWith(t.href))}>
          {t.label}
        </Link>
      ))}
    </div>
  )
}
