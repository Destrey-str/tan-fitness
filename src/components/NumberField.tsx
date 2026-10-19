import { useEffect, useId, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

function toText(value: number | undefined | null): string {
  if (value == null || typeof value !== 'number' || Number.isNaN(value)) return ''
  return String(value)
}

function parseNum(raw: string, integer: boolean): number | undefined {
  const t = raw.trim()
  if (t === '' || t === '-' || t === '.' || t === '-.') return undefined
  const n = integer ? Number.parseInt(t, 10) : Number.parseFloat(t)
  if (!Number.isFinite(n)) return undefined
  return n
}

function isIncomplete(raw: string): boolean {
  const t = raw.trim()
  return t === '-' || t.endsWith('.')
}

export function NumberField({
  label,
  unit,
  hint,
  value,
  onChange,
  integer = false,
  min,
  className,
  inputMode,
}: {
  label: string
  unit?: string
  hint?: string
  value: number | undefined
  onChange: (next: number | undefined) => void
  integer?: boolean
  min?: number
  className?: string
  inputMode?: 'decimal' | 'numeric'
}) {
  const id = useId()
  const focusedRef = useRef(false)
  const [text, setText] = useState(toText(value))

  useEffect(() => {
    if (!focusedRef.current) setText(toText(value))
  }, [value])

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {unit ? <span className="ml-1 font-normal">({unit})</span> : null}
      </Label>
      <Input
        id={id}
        inputMode={inputMode ?? (integer ? 'numeric' : 'decimal')}
        value={text}
        min={min}
        placeholder="—"
        onFocus={() => {
          focusedRef.current = true
        }}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          if (next.trim() === '') {
            onChange(undefined)
            return
          }
          if (isIncomplete(next)) return
          const parsed = parseNum(next, integer)
          if (parsed !== undefined) onChange(parsed)
        }}
        onBlur={() => {
          focusedRef.current = false
          const parsed = parseNum(text, integer)
          setText(toText(parsed))
          onChange(parsed)
        }}
      />
      {hint ? (
        <p className="text-[11px] leading-snug text-[var(--muted)]">{hint}</p>
      ) : null}
    </div>
  )
}
