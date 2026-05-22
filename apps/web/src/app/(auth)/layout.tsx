import type { ReactNode } from 'react';
import { TRPCProvider } from '@/lib/trpc-client';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <TRPCProvider>
      <TooltipProvider delayDuration={300}>
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
          <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12">
            <div className="mb-6 flex items-center gap-2 text-md font-semibold text-primary-600 dark:text-primary-400">
              <img src="/logo/logo.png" alt="AgentCron" className="h-9 w-9 rounded-md" />
              <span>AgentCron</span>
            </div>
            {children}
            <p className="mt-12 text-xs text-neutral-400">v1.0 · 本机数据不会上传</p>
          </div>
          <Toaster />
        </div>
      </TooltipProvider>
    </TRPCProvider>
  );
}
