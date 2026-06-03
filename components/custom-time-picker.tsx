'use client'
import React from 'react'

interface CustomTimePickerProps {
  value: string        // 'HH:MM' or ''
  onChange: (value: string) => void
  placeholder?: string
  name?: string
}

// Generate times from 0:00 to 23:30 in 30-min steps
const TIMES: string[] = []
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIMES.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
}

export function CustomTimePicker({ value, onChange, placeholder = '選択', name }: CustomTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const [focusIdx, setFocusIdx] = React.useState(0)

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // When opened: scroll to selected time and focus it
  React.useEffect(() => {
    if (!open || !listRef.current) return
    const idx = value ? TIMES.indexOf(value) : -1
    const target = idx >= 0 ? idx : TIMES.findIndex(t => t >= '09:00')
    setFocusIdx(target)
    const btns = listRef.current.querySelectorAll<HTMLButtonElement>('.csel__opt')
    const btn = btns[target]
    if (btn) {
      btn.focus()
      btn.scrollIntoView({ block: 'nearest' })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Move focus when focusIdx changes
  React.useEffect(() => {
    if (!open || !listRef.current) return
    const btns = listRef.current.querySelectorAll<HTMLButtonElement>('.csel__opt')
    const btn = btns[focusIdx]
    if (btn) { btn.focus(); btn.scrollIntoView({ block: 'nearest' }) }
  }, [focusIdx, open])

  const handleTriggerKey = (e: React.KeyboardEvent) => {
    if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setOpen(true) }
  }

  const handleListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, TIMES.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Tab') setOpen(false)
  }

  const select = (t: string) => { onChange(t); setOpen(false) }

  return (
    <div ref={wrapRef} className="csel">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        className="csel__trigger"
        data-open={String(open)}
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={'csel__val' + (value ? '' : ' csel__placeholder')}>
          {value || placeholder}
        </span>
        <svg className="csel__chevron" width={15} height={15} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div ref={listRef} className="csel__list" role="listbox" onKeyDown={handleListKey}
          style={{ maxHeight: 220 }}>
          {TIMES.map((t, i) => (
            <button
              key={t}
              type="button"
              className="csel__opt"
              data-selected={String(t === value)}
              role="option"
              aria-selected={t === value}
              tabIndex={focusIdx === i ? 0 : -1}
              onClick={() => select(t)}
            >
              <span>{t}</span>
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
