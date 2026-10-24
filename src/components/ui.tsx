import type { ReactNode } from 'react'

export function Field({ label, hint, extra, children }: { label: string; hint?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {extra}
      </div>
      {children}
      {hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  )
}

export function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-label">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <button
        type="button"
        className="switch"
        data-on={on}
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
      />
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size,
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (next: T) => void
  size?: 'sm'
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className="seg-item"
          data-active={value === option.value}
          title={option.title}
          style={size === 'sm' ? { padding: '3px 8px', fontSize: 11.5 } : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function StatusLine({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'warn' | 'err'; children: ReactNode }) {
  return (
    <div className="status-line" data-tone={tone}>
      {children}
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (next: number) => void
  format?: (value: number) => string
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <span className="mono" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="row" style={{ marginBottom: 10 }}>
      <div className="panel-title">{title}</div>
      <div className="spacer" />
      {action}
    </div>
  )
}

export function Spinner({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" fill="none" opacity="0.22" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}
