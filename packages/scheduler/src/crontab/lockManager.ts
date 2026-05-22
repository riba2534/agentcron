import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { CCT, cct } from '@cct/shared';
import lockfile from 'proper-lockfile';

export interface CrontabLockOptions {
  retries?: number;
  retryWait?: number;
  stale?: number;
}

export type ReleaseLockFn = () => Promise<void>;

const DEFAULT_LOCK_PATH = () => path.join(os.homedir(), '.cct/crontab.lock');

export async function acquireCrontabLock(
  opts: CrontabLockOptions = {},
  lockPath: string = DEFAULT_LOCK_PATH(),
): Promise<ReleaseLockFn> {
  const dir = path.dirname(lockPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(lockPath, '', { flag: 'a' });

  try {
    const release = await lockfile.lock(lockPath, {
      retries: {
        retries: opts.retries ?? 5,
        minTimeout: opts.retryWait ?? 200,
        maxTimeout: opts.retryWait ?? 200,
        factor: 1,
      },
      stale: opts.stale ?? 30_000,
    });
    return async () => {
      await release();
    };
  } catch (e) {
    throw cct.failedPrecondition(CCT.SCHEDULER_LOCK_TIMEOUT, {
      lockPath,
      cause: (e as Error).message,
    });
  }
}
