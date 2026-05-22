'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { Copy } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

interface LogViewerProps {
  lines: string[];
  className?: string;
  maxHeight?: number;
  emptyText?: string;
}

export function LogViewer({ lines, className, maxHeight = 480, emptyText = '暂无日志' }: LogViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 12,
  });

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success('已复制日志');
    } catch {
      toast.error('复制失败');
    }
  };

  return (
    <div className={cn('overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800', className)}>
      <div className="flex items-center justify-between bg-neutral-100 px-3 py-1.5 text-xs text-neutral-500 dark:bg-neutral-900">
        <span>{lines.length} 行</span>
        <Button size="sm" variant="ghost" className="h-7" onClick={onCopy}>
          <Copy className="h-3 w-3" /> 复制
        </Button>
      </div>
      <div
        ref={parentRef}
        className="overflow-auto bg-neutral-950 text-neutral-100"
        style={{ maxHeight }}
      >
        {lines.length === 0 ? (
          <div className="px-3 py-6 text-sm text-neutral-400">{emptyText}</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }} className="font-mono text-xs leading-[22px]">
            {virtualizer.getVirtualItems().map((vi) => {
              const line = lines[vi.index] ?? '';
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
                  className="whitespace-pre px-3"
                >
                  <span className="select-none pr-3 text-neutral-500">{vi.index + 1}</span>
                  {line || ' '}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
