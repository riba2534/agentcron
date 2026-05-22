// output — 彩色文本与 JSON 两种格式化。
// Source of truth: design/05-backend.md §7 末"修复指引输出格式"样例。
import chalk from 'chalk';
import type { DoctorRunReport, ProbeResult } from './types.js';

export type OutputFormat = 'text' | 'json';

const TAGS: Record<ProbeResult['level'], string> = {
  ok: '[OK   ]',
  warn: '[WARN ]',
  error: '[ERROR]',
};

export function formatJson(report: DoctorRunReport): string {
  return JSON.stringify(report, null, 2);
}

function indent(text: string, prefix = '  '): string {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

function paintTag(level: ProbeResult['level'], useColor: boolean): string {
  const tag = TAGS[level];
  if (!useColor) return tag;
  switch (level) {
    case 'ok':
      return chalk.green(tag);
    case 'warn':
      return chalk.yellow(tag);
    case 'error':
      return chalk.red(tag);
  }
}

export function formatText(report: DoctorRunReport, useColor = true): string {
  const lines: string[] = [];
  lines.push(`cct-doctor — ${report.platform} — generated ${report.generatedAt}`);
  lines.push(
    `summary: ${report.okCount} ok / ${report.warnCount} warn / ${report.errorCount} error`,
  );
  lines.push('');

  for (const r of report.results) {
    const tag = paintTag(r.level, useColor);
    lines.push(`${tag} ${r.name}${r.message ? ` — ${r.message}` : ''}`);
    if (r.remediation) {
      lines.push(indent('Fix:'));
      lines.push(indent(r.remediation, '    '));
    }
  }
  lines.push('');
  if (report.errorCount === 0 && report.warnCount === 0) {
    lines.push(useColor ? chalk.green('All probes passed.') : 'All probes passed.');
  } else if (report.errorCount === 0) {
    lines.push(
      useColor
        ? chalk.yellow(`${report.warnCount} warning(s); no errors.`)
        : `${report.warnCount} warning(s); no errors.`,
    );
  } else {
    lines.push(
      useColor
        ? chalk.red(
            `${report.errorCount} error(s) — exit code = ${report.errorCount}.`,
          )
        : `${report.errorCount} error(s) — exit code = ${report.errorCount}.`,
    );
  }
  return lines.join('\n');
}

export function format(report: DoctorRunReport, fmt: OutputFormat, useColor = true): string {
  return fmt === 'json' ? formatJson(report) : formatText(report, useColor);
}
