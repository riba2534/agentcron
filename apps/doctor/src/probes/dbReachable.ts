// dbReachable probe — Prisma SQLite 可读且能 SELECT 1。
// Source of truth: design/05-backend.md §7.
import type { PrismaClient } from '@cct/db';
import type { ProbeResult } from '../types.js';

const PROBE_NAME = 'dbReachable';

export async function probeDbReachable(prisma: PrismaClient): Promise<ProbeResult> {
  const dbUrl = process.env.CCT_DB_URL ?? '(undefined CCT_DB_URL)';
  try {
    const rows = await prisma.$queryRawUnsafe<unknown[]>('SELECT 1 AS ok');
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        name: PROBE_NAME,
        level: 'error',
        message: `SELECT 1 returned empty result from ${dbUrl}`,
        remediation: 'Ensure database has been initialized: `pnpm db:push`',
        details: { dbUrl },
      };
    }
    return {
      name: PROBE_NAME,
      level: 'ok',
      message: `SQLite reachable (${dbUrl})`,
      details: { dbUrl },
    };
  } catch (e: unknown) {
    const msg = (e as Error).message;
    return {
      name: PROBE_NAME,
      level: 'error',
      message: `DB query failed: ${msg}`,
      remediation: [
        'Check CCT_DB_URL points to a valid SQLite file.',
        'Run `pnpm db:push` to apply migrations.',
      ].join('\n'),
      details: { dbUrl },
    };
  }
}
