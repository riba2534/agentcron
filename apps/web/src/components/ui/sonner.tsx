'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-neutral-0 group-[.toaster]:text-neutral-900 group-[.toaster]:border-neutral-200 group-[.toaster]:shadow-lg dark:group-[.toaster]:bg-neutral-900 dark:group-[.toaster]:text-neutral-50 dark:group-[.toaster]:border-neutral-800',
          description: 'group-[.toast]:text-neutral-500',
          actionButton:
            'group-[.toast]:bg-primary-500 group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-neutral-100 group-[.toast]:text-neutral-700',
          error: 'group-[.toaster]:border-danger-500/40',
          success: 'group-[.toaster]:border-success-500/40',
          warning: 'group-[.toaster]:border-warning-500/40',
          info: 'group-[.toaster]:border-info-500/40',
        },
      }}
      {...props}
    />
  );
}

export { toast } from 'sonner';
