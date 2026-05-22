import { cn } from '@/lib/utils';

interface KeyboardHintProps {
  keys: string[];
  className?: string;
}

export function KeyboardHint({ keys, className }: KeyboardHintProps) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-neutral-300 bg-neutral-100 px-1 text-[10px] font-mono font-medium text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
