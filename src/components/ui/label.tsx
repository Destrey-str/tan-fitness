import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn(
        'text-xs font-medium text-[var(--muted)] leading-none',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
