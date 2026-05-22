import type { ReactNode } from 'react';
import { TRPCProvider } from '@/lib/trpc-client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { TopNav } from '@/components/TopNav';
import { GlobalShellEffects } from '@/components/GlobalShellEffects';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <TRPCProvider>
      <TooltipProvider delayDuration={300}>
        <div className="flex min-h-screen flex-col bg-neutral-50 dark:bg-neutral-950">
          <TopNav />
          <main className="flex-1">
            <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
          </main>
          <Toaster />
          <GlobalShellEffects />
        </div>
      </TooltipProvider>
    </TRPCProvider>
  );
}
