'use client'
import React from 'react'

export interface SelectOption {
  value: string
  label: string
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  name?: string
  required?: boolean
}

const STYLES = `
.csel { position: relative; width: 100%; }
.csel__trigger {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-family: var(--font-sans); font-size: var(--base); color: var(--text);
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm); padding: 9px 11px; cursor: pointer;
  transition: border-color 0.14s, box-shadow 0.14s; text-align: left; line-height: 1.5;
}
.csel__trigger:hover:not([disabled]) { border-color: var(--accent); }
.csel__trigger[data-open="true"] { border-color: var(--accent); box-shadow: var(--ring); }
.csel__trigger[disabled] { opacity: 0.45; cursor: not-allowed; }
.csel__val { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.csel__placeholder { color: var(--text-faint); }
.csel__chevron {
  flex: 0 0 auto; color: var(--text-faint);
  transition: transform 0.2s cubic-bezier(0.4,0,0.2,1);
}
.csel__trigger[data-open="true"] .csel__chevron { transform: rotate(180deg); }
.csel__list {
  position: absolute; top: calc(100% + 5px); left: 0; right: 0; z-index: 100;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow-pop); overflow: hidden; max-height: 260px; overflow-y: auto;
  animation: cselOpen 0.15s cubic-bezier(0.2,0.8,0.3,1) both;
  transform-origin: top center;
}
.csel__list::-webkit-scrollbar { width: 6px; }
.csel__list::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 10px; }
@keyframes cselOpen {
  from { opacity: 0; transform: translateY(-6px) scaleY(0.94); }
  to   { opacity: 1; transform: translateY(0) scaleY(1); }
}
.csel__opt {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 9px 12px; font-family: var(--font-sans); font-size: var(--base);
  color: var(--text); background: transparent; border: 0; cursor: pointer; text-align: left;
  transition: background 0.1s;
}
.csel__opt:hover { background: var(--surface-2); }
.csel__opt[data-selected="true"] {
  color: var(--accent-text); background: var(--accent-soft); font-weight: 600;
}
.csel__opt:focus-visible { outline: none; background: var(--accent-soft); }
.csel__check { opacity: 0; flex: 0 0 auto; }
.csel__opt[data-selected="true"] .csel__check { opacity: 1; }
`

export function CustomSelect({
  value, onChange, options, placeholder, disabled, name, required
}: CustomSelectProps) {
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const [focusIdx, setFocusIdx] = React.useState(0)

  const selected = options.find(o => o.value === value)

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Focus the selected/first option when opened
  React.useEffect(() => {
    if (!open || !listRef.current) return
    const idx = options.findIndex(o => o.value === value)
    const target = idx >= 0 ? idx : 0
    setFocusIdx(target)
    const btns = listRef.current.querySelectorAll<HTMLButtonElement>('.csel__opt')
    btns[target]?.focus()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Move focus when focusIdx changes
  React.useEffect(() => {
    if (!open || !listRef.current) return
    const btns = listRef.current.querySelectorAll<HTMLButtonElement>('.csel__opt')
    btns[focusIdx]?.focus()
  }, [focusIdx, open])

  const handleTriggerKey = (e: React.KeyboardEvent) => {
    if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setOpen(true) }
  }

  const handleListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, options.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Tab') setOpen(false)
  }

  const select = (val: string) => { onChange(val); setOpen(false) }

  return (
    <div ref={wrapRef} className="csel">
      <style>{STYLES}</style>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        type="button"
        className="csel__trigger"
        data-open={String(open)}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={handleTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={'csel__val' + (selected ? '' : ' csel__placeholder')}>
          {selected ? selected.label : (placeholder ?? '選択してください')}
        </span>
        <svg className="csel__chevron" width={15} height={15} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div ref={listRef} className="csel__list" role="listbox" onKeyDown={handleListKey}>
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              className="csel__opt"
              data-selected={String(o.value === value)}
              role="option"
              aria-selected={o.value === value}
              tabIndex={focusIdx === i ? 0 : -1}
              onClick={() => select(o.value)}
            >
              <span>{o.label}</span>
              <svg className="csel__check" width={14} height={14} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
