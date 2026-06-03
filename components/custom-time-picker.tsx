'use client'
import React from 'react'
import { createPortal } from 'react-dom'

interface CustomTimePickerProps {
  value: string        // 'HH:MM' or ''
  onChange: (value: string) => void
  placeholder?: string
  name?: string
}

const TIMES: string[] = []
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIMES.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
}

export function CustomTimePicker({ value, onChange, placeholder = '選択', name }: CustomTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 0 })
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const [focusIdx, setFocusIdx] = React.useState(0)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => { setMounted(true) }, [])

  // Recalculate position on open
  const openDropdown = () => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + window.scrollY + 5, left: r.left + window.scrollX, width: r.width })
    setOpen(true)
  }

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Scroll to selected / focus on open
  React.useEffect(() => {
    if (!open || !listRef.current) return
    const idx = value ? TIMES.indexOf(value) : -1
    const target = idx >= 0 ? idx : TIMES.findIndex(t => t >= '09:00')
    setFocusIdx(target)
    const btns = listRef.current.querySelectorAll<HTMLButtonElement>('.csel__opt')
    const btn = btns[target]
    if (btn) { btn.focus(); btn.scrollIntoView({ block: 'center' }) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open || !listRef.current) return
    const btns = listRef.current.querySelectorAll<HTMLButtonElement>('.csel__opt')
    const btn = btns[focusIdx]
    if (btn) { btn.focus(); btn.scrollIntoView({ block: 'nearest' }) }
  }, [focusIdx, open])

  const handleTriggerKey = (e: React.KeyboardEvent) => {
    if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); openDropdown() }
  }

  const handleListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, TIMES.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Tab') setOpen(false)
  }

  const select = (t: string) => { onChange(t); setOpen(false) }

  const list = mounted && open ? createPortal(
    <div
      ref={listRef}
      className="csel__list"
      role="listbox"
      onKeyDown={handleListKey}
      style={{ position: 'absolute', top: pos.top, left: pos.left, width: pos.width, maxHeight: 220, zIndex: 9999 }}
    >
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
    </div>,
    document.body
  ) : null

  return (
    <div className="csel">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        type="button"
        className="csel__trigger"
        data-open={String(open)}
        onClick={() => open ? setOpen(false) : openDropdown()}
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
      {list}
    </div>
  )
}
