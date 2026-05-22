'use client';

import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface DangerBadgeProps {
  className?: string;
  inline?: boolean;
}

export function DangerBadge({ className, inline }: DangerBadgeProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label="此任务以最高权限运行"
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-full border border-danger-500/40 bg-danger-50 px-2 text-xs font-medium text-danger-600 dark:border-danger-500/50 dark:bg-danger-900 dark:text-danger-500',
              inline && 'h-5 text-[11px]',
              className,
            )}
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            以最高权限运行
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          为本机便利已跳过工具确认，请只放可信任务。
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
