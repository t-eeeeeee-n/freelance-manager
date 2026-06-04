import { SettingsNav } from './settings-nav'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>設定</h1></div>
      </div>
      <SettingsNav />
      {children}
    </div>
  )
}
