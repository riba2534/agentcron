export const SECTION_BEGIN = '# === cct-managed BEGIN ===';
export const SECTION_END = '# === cct-managed END ===';
const NOTICE_LINE = '# CCT v1.0 — DO NOT EDIT BY HAND, USE Claude Crontab UI';

export interface CrontabEntryLine {
  taskId: string;
  cronExpression: string;
  command: string;
  enabled: boolean;
}

export function stripManagedSection(crontab: string): string {
  if (!crontab.includes(SECTION_BEGIN)) return crontab;
  const lines = crontab.split('\n');
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (line.trim() === SECTION_BEGIN) {
      inside = true;
      continue;
    }
    if (inside && line.trim() === SECTION_END) {
      inside = false;
      continue;
    }
    if (!inside) out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

export function renderManagedSection(entries: CrontabEntryLine[]): string {
  const body = entries
    .filter((e) => e.enabled)
    .map((e) => `${e.cronExpression} ${e.command} # cct:${e.taskId}`)
    .join('\n');
  const inner = body ? `${body}\n` : '';
  return `${SECTION_BEGIN}\n${NOTICE_LINE}\n${inner}${SECTION_END}`;
}

export function spliceManagedSection(
  current: string,
  entries: CrontabEntryLine[],
): string {
  const cleaned = stripManagedSection(current);
  const trimmed = cleaned.replace(/\s+$/g, '');
  const managed = renderManagedSection(entries);
  if (!trimmed) return `${managed}\n`;
  return `${trimmed}\n\n${managed}\n`;
}

export function parseManagedSection(crontab: string): CrontabEntryLine[] {
  const beginIdx = crontab.indexOf(SECTION_BEGIN);
  if (beginIdx < 0) return [];
  const after = crontab.slice(beginIdx);
  const endIdx = after.indexOf(SECTION_END);
  if (endIdx < 0) return [];
  const inner = after.slice(SECTION_BEGIN.length, endIdx).trim();
  const entries: CrontabEntryLine[] = [];
  for (const raw of inner.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+?)(?:\s+#\s*cct:(\S+))?\s*$/.exec(line);
    if (!m) continue;
    const cronExpression = m[1] ?? '';
    const command = (m[2] ?? '').trim();
    const taskId = m[3] ?? '';
    if (!cronExpression || !command || !taskId) continue;
    entries.push({ cronExpression, command, taskId, enabled: true });
  }
  return entries;
}
