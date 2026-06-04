import { AppearanceUI } from './appearance-ui'

export default function AppearancePage() {
  return (
    <>
      <p style={{ fontSize: 'var(--small)', color: 'var(--text-faint)', marginBottom: 16 }}>テーマ・アクセントカラー・表示密度の設定（この端末に保存されます）</p>
      <AppearanceUI />
    </>
  )
}
