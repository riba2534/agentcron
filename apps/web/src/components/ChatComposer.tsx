'use client';

import { useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatComposerProps {
  onSubmit: (text: string) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
  initialValue?: string;
}

export function ChatComposer({
  onSubmit,
  placeholder = '输入回答，Cmd/Ctrl + Enter 发送',
  disabled,
  pending,
  className,
  initialValue = '',
}: ChatComposerProps) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [value]);

  const submit = async () => {
    const t = value.trim();
    if (!t || pending || disabled) return;
    await onSubmit(t);
    setValue('');
  };

  return (
    <div className={cn('flex items-end gap-2', className)}>
      <Textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[44px] resize-none"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <Button onClick={() => void submit()} disabled={disabled || pending || !value.trim()} className="h-[44px]">
        <SendHorizontal className="h-4 w-4" />
        {pending ? '发送中…' : '发送'}
      </Button>
    </div>
  );
}
