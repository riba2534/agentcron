import { describe, expect, it } from 'vitest';
import { probeDbReachable } from '../../src/probes/dbReachable.js';

interface FakePrisma {
  $queryRawUnsafe: (q: string) => Promise<unknown[]>;
}

describe('probeDbReachable', () => {
  it('returns ok when SELECT 1 succeeds', async () => {
    const prisma: FakePrisma = {
      $queryRawUnsafe: async () => [{ ok: 1 }],
    };
    // probeDbReachable expects PrismaClient but we only need $queryRawUnsafe.
    // biome-ignore lint/suspicious/noExplicitAny: structural duck-type fake.
    const r = await probeDbReachable(prisma as any);
    expect(r.level).toBe('ok');
  });

  it('returns error when query throws', async () => {
    const prisma: FakePrisma = {
      $queryRawUnsafe: async () => {
        throw new Error('database is locked');
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: structural duck-type fake.
    const r = await probeDbReachable(prisma as any);
    expect(r.level).toBe('error');
    expect(r.message).toMatch(/database is locked/);
    expect(r.remediation).toMatch(/db:push/);
  });

  it('returns error when query returns empty array', async () => {
    const prisma: FakePrisma = {
      $queryRawUnsafe: async () => [],
    };
    // biome-ignore lint/suspicious/noExplicitAny: structural duck-type fake.
    const r = await probeDbReachable(prisma as any);
    expect(r.level).toBe('error');
    expect(r.message).toMatch(/empty/);
  });
});
