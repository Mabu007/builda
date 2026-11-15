import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
const buttonVariants = cva('inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:pointer-events-none disabled:opacity-50', { variants: { variant: { default: 'bg-[#c4a16a] text-[#121313] hover:bg-[#d6bb8d]', outline: 'border border-white/40 text-white hover:bg-white/10', ghost: 'hover:bg-stone-100' }, size: { default: 'h-12 px-6', lg: 'h-14 px-7' } }, defaultVariants: { variant: 'default', size: 'default' } });
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => { const Comp = asChild ? Slot : 'button'; return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />; });
Button.displayName = 'Button';
export { Button, buttonVariants };
