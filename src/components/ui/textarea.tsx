import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2.5 text-base text-[var(--fg)] outline-none placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-navy/35',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
