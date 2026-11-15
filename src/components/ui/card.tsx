import * as React from 'react'
import { cn } from '../../lib/utils'

// Adapted from the shadcn/ui card primitive for this application's theme.
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('rounded-xl border shadow-sm', className)} {...props} />
}
export { Card }
