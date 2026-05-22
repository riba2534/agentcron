import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-current [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'bg-neutral-0 text-neutral-900 border-neutral-200 dark:bg-neutral-950 dark:text-neutral-50 dark:border-neutral-800',
        info: 'bg-info-50 text-info-500 border-info-500/30 dark:bg-info-900 dark:text-info-500 dark:border-info-500/30',
        success: 'bg-success-50 text-success-600 border-success-500/30 dark:bg-success-900 dark:text-success-500',
        warning: 'bg-warning-50 text-warning-500 border-warning-500/30 dark:bg-warning-900',
        danger: 'bg-danger-50 text-danger-600 border-danger-500/30 dark:bg-danger-900 dark:text-danger-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const VariantIcon = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
} as const;

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  hideIcon?: boolean;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', hideIcon, children, ...props }, ref) => {
    const Icon = VariantIcon[variant ?? 'default'];
    return (
      <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
        {!hideIcon ? <Icon className="h-4 w-4" /> : null}
        {children}
      </div>
    );
  },
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
  ),
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
