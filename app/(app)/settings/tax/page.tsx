import { createClient } from '@/lib/supabase/server'
import { TaxSettingsUI } from './tax-settings-ui'

export default async function TaxSettingsPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase.from('tax_settings').select('*').limit(1).maybeSingle()
  return (
    <>
      <p style={{ fontSize: 'var(--small)', color: 'var(--text-faint)', marginBottom: 16 }}>
        年間手取り試算に使うパラメータ（概算）。正確な税額・保険料は税理士・自治体にご確認ください。
      </p>
      <TaxSettingsUI settings={settings ?? null} />
    </>
  )
}
