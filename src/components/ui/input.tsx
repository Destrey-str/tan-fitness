import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-base text-[var(--fg)] outline-none transition-shadow placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-navy/35 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
