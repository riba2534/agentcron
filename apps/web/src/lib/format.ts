import { formatDistanceToNow as fdn, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function formatRelative(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return fdn(d, { addSuffix: true, locale: zhCN });
}

export function formatDateTime(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return format(d, 'yyyy-MM-dd HH:mm:ss');
}

export function formatTime(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return format(d, 'HH:mm');
}

export function formatMoney(usd: number | null | undefined): string {
  if (usd == null) return '—';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(count: number | null | undefined): string {
  if (count == null) return '—';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}min`;
  return `${(m / 60).toFixed(1)}h`;
}
