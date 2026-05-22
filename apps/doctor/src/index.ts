#!/usr/bin/env node
// cct-doctor — local environment self-check CLI.
// Source of truth: design/05-backend.md §7.
import { prisma } from '@cct/db';
import { runUninstall } from './commands/uninstall.js';
import { runReconcile } from './commands/reconcile.js';
import { format, type OutputFormat } from './output.js';
import { probeTcc } from './probes/tcc.js';
import { runAll } from './runner.js';

interface ParsedArgs {
  command: 'check' | 'reconcile' | 'uninstall' | 'help' | 'tcc-probe';
  json: boolean;
  noColor: boolean;
  yes: boolean;
  confirm: boolean;
}

function printHelp(): void {
  process.stdout.write(
    [
      'cct-doctor — Claude Crontab local environment self-check.',
      '',
      'Usage:',
      '  cct-doctor [check]              Run all probes (default).',
      '  cct-doctor reconcile            Heal orphan/ghost scheduler entries (interactive).',
      '  cct-doctor uninstall --confirm  Remove plist/crontab + master key + DB (double-confirm).',
      '  cct-doctor --tcc-probe          Run only the TCC probe (used by cct-runner).',
      '  cct-doctor --help               Show this help.',
      '',
      'Flags:',
      '  --json        Emit JSON instead of colored text.',
      '  --no-color    Disable ANSI colors in text output.',
      '  --yes / -y    Skip interactive prompts (use carefully).',
      '  --confirm     Required for uninstall (first of two gates).',
      '',
      'Environment:',
      '  CCT_DB_URL                SQLite URL (file:...).',
      '  CCT_LOG_DIR               log directory override.',
      '  CCT_RUNNER_BIN            override `cct-runner` path lookup.',
      '  CCT_CLAUDE_BIN            override `claude` path lookup.',
      '  CCT_MASTER_KEY_PATH       linux master.key path override.',
      '  CCT_NTP_SERVER            override sntp probe target (default time.apple.com).',
      '',
    ].join('\n'),
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    command: 'check',
    json: false,
    noColor: false,
    yes: false,
    confirm: false,
  };
  let positional = 0;
  for (const a of argv) {
    if (a === '--json') out.json = true;
    else if (a === '--no-color') out.noColor = true;
    else if (a === '-y' || a === '--yes') out.yes = true;
    else if (a === '--confirm') out.confirm = true;
    else if (a === '-h' || a === '--help') out.command = 'help';
    else if (a === '--tcc-probe') out.command = 'tcc-probe';
    else if (a.startsWith('--')) {
      // 未知 flag → 忽略，避免阻塞自动化使用
      process.stderr.write(`[cct-doctor] warning: unknown flag ${a} ignored.\n`);
    } else if (positional === 0) {
      if (a === 'check' || a === 'reconcile' || a === 'uninstall') out.command = a;
      else {
        process.stderr.write(`[cct-doctor] unknown command: ${a}\n`);
        out.command = 'help';
      }
      positional++;
    }
  }
  return out;
}

function shouldUseColor(args: ParsedArgs): boolean {
  if (args.noColor) return false;
  if (args.json) return false;
  if (process.env.NO_COLOR) return false;
  return process.stdout.isTTY === true;
}

async function runCheck(args: ParsedArgs): Promise<number> {
  const fmt: OutputFormat = args.json ? 'json' : 'text';
  const useColor = shouldUseColor(args);
  let report;
  try {
    report = await runAll({ prisma });
  } catch (e: unknown) {
    // runAll 自己 try/catch 每个 probe，理论不到这里；兜底防御。
    if (args.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            error: `CCT_DOCTOR_RUN_FAILED: ${(e as Error).message}`,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      process.stderr.write(`[cct-doctor] CCT_DOCTOR_RUN_FAILED: ${(e as Error).message}\n`);
    }
    return 1;
  }
  process.stdout.write(`${format(report, fmt, useColor)}\n`);
  return Math.min(report.errorCount, 255); // exit code 上限 255
}

async function runTccProbe(args: ParsedArgs): Promise<number> {
  const result = await probeTcc();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const tag =
      result.level === 'ok'
        ? '[OK   ]'
        : result.level === 'warn'
          ? '[WARN ]'
          : '[ERROR]';
    process.stdout.write(`${tag} ${result.name} — ${result.message ?? ''}\n`);
    if (result.remediation) process.stdout.write(`Fix:\n  ${result.remediation.replace(/\n/g, '\n  ')}\n`);
  }
  return result.level === 'error' ? 1 : 0;
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  switch (args.command) {
    case 'help':
      printHelp();
      return 0;
    case 'tcc-probe':
      return await runTccProbe(args);
    case 'reconcile':
      return await runReconcile({ prisma, yes: args.yes, json: args.json });
    case 'uninstall':
      return await runUninstall({
        prisma,
        confirm: args.confirm,
        yes: args.yes,
        json: args.json,
      });
    default:
      return await runCheck(args);
  }
}

main(process.argv.slice(2))
  .then(async (code) => {
    await prisma.$disconnect().catch(() => {});
    process.exit(code);
  })
  .catch(async (e: unknown) => {
    process.stderr.write(`[cct-doctor] CCT_DOCTOR_RUN_FAILED: ${(e as Error).message}\n`);
    await prisma.$disconnect().catch(() => {});
    process.exit(99);
  });
