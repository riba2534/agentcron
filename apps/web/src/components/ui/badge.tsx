import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        neutral:
          'border-transparent bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
        success:
          'border-transparent bg-success-50 text-success-600 dark:bg-success-900 dark:text-success-500',
        warning:
          'border-transparent bg-warning-50 text-warning-500 dark:bg-warning-900 dark:text-warning-500',
        danger:
          'border-transparent bg-danger-50 text-danger-600 dark:bg-danger-900 dark:text-danger-500',
        info: 'border-transparent bg-info-50 text-info-500 dark:bg-info-900 dark:text-info-500',
        outline: 'border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
