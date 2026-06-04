'use client'
import React from 'react'

const ACCENTS = [
  { key: 'green', label: 'グリーン', hue: 168, chroma: 0.10 },
  { key: 'teal', label: 'ティール', hue: 200, chroma: 0.085 },
  { key: 'blue', label: 'ブルー', hue: 255, chroma: 0.13 },
  { key: 'violet', label: 'バイオレット', hue: 300, chroma: 0.12 },
  { key: 'clay', label: 'クレイ', hue: 45, chroma: 0.11 },
]
const DENSITIES = [
  { key: 'compact', label: '密' },
  { key: 'comfortable', label: '標準' },
  { key: 'spacious', label: '広' },
]
const RADII = [
  { key: 'minimal', label: '控えめ' },
  { key: 'soft', label: '標準' },
  { key: 'round', label: '丸み' },
]
const THEMES = [
  { key: 'light', label: 'ライト' },
  { key: 'dark', label: 'ダーク' },
]

function useSetting(storageKey: string, attr: string, initial: string) {
  const [value, setValue] = React.useState(initial)
  React.useEffect(() => {
    setValue(localStorage.getItem(storageKey) || initial)
  }, [storageKey, initial])
  const update = (v: string) => {
    setValue(v)
    localStorage.setItem(storageKey, v)
    document.documentElement.setAttribute(attr, v)
  }
  return [value, update] as const
}

function SegRow({ label, options, value, onChange }: {
  label: string
  options: { key: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="field" style={{ marginBottom: 20 }}>
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(o => (
          <button
            key={o.key}
            type="button"
            className={value === o.key ? 'btn btn--primary btn--sm' : 'btn btn--ghost btn--sm'}
            onClick={() => onChange(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AppearanceUI() {
  const [theme, setTheme] = useSetting('fd_theme', 'data-theme', 'light')
  const [accent, setAccent] = useSetting('fd_accent', 'data-accent', 'green')
  const [density, setDensity] = useSetting('fd_density', 'data-density', 'comfortable')
  const [radius, setRadius] = useSetting('fd_radius', 'data-radius', 'soft')

  return (
    <div style={{ maxWidth: 520 }}>
      <SegRow label="テーマ" options={THEMES} value={theme} onChange={setTheme} />
      <div className="field" style={{ marginBottom: 20 }}>
        <label>アクセントカラー</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ACCENTS.map(a => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAccent(a.key)}
              aria-label={a.label}
              title={a.label}
              style={{
                width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                background: `oklch(0.56 ${a.chroma} ${a.hue})`,
                border: accent === a.key ? '3px solid var(--text)' : '3px solid transparent',
                transition: 'border-color 0.14s',
              }}
            />
          ))}
        </div>
      </div>
      <SegRow label="情報密度" options={DENSITIES} value={density} onChange={setDensity} />
      <SegRow label="角丸" options={RADII} value={radius} onChange={setRadius} />
    </div>
  )
}
