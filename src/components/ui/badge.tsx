import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

function Badge({
  className,
  tone = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'default' | 'good' | 'bad' | 'info'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'default' && 'bg-[var(--line)] text-[var(--muted)]',
        tone === 'good' && 'bg-deficit/15 text-deficit',
        tone === 'bad' && 'bg-surplus/15 text-surplus',
        tone === 'info' && 'bg-weight/20 text-navy',
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
