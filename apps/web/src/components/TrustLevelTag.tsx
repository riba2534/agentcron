import { Globe, Server, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TrustLevel = 'official' | 'self-hosted' | 'third-party';

const STYLE: Record<TrustLevel, { icon: typeof ShieldCheck; label: string; cls: string }> = {
  official: {
    icon: ShieldCheck,
    label: '官方',
    cls: 'bg-trust-official-bg text-trust-official-fg',
  },
  'self-hosted': {
    icon: Server,
    label: '自建',
    cls: 'bg-trust-self-hosted-bg text-trust-self-hosted-fg',
  },
  'third-party': {
    icon: Globe,
    label: '第三方',
    cls: 'bg-trust-third-party-bg text-trust-third-party-fg',
  },
};

interface TrustLevelTagProps {
  level: TrustLevel;
  className?: string;
  showLabel?: boolean;
}

export function TrustLevelTag({ level, className, showLabel = true }: TrustLevelTagProps) {
  const conf = STYLE[level];
  const Icon = conf.icon;
  return (
    <span
      aria-label={`信任级别：${conf.label}`}
      title={level}
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-xs font-medium',
        conf.cls,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {showLabel ? conf.label : null}
    </span>
  );
}
