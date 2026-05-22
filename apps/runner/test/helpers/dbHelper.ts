import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@cct/db';

const execFile = promisify(execFileCb);

const HERE = path.dirname(fileURLToPath(import.meta.url));

// apps/runner/test/helpers/dbHelper.ts → 四层向上到仓库根
const SCHEMA_PATH = path.resolve(
  HERE,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'prisma',
  'schema.prisma',
);

let templatePath: string | null = null;

// 预生成 schema → 一份模板 db；后续测试拷贝模板，避免每次都跑 prisma db push。
async function ensureTemplate(): Promise<string> {
  if (templatePath) return templatePath;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cct-runner-template-'));
  const file = path.join(dir, 'template.db');
  // prisma binary 安装在 packages/db 内，从那个 cwd 跑确保 pnpm exec 能找到
  const dbPackageDir = path.dirname(SCHEMA_PATH).replace(/\/prisma$/, '');
  await execFile(
    'pnpm',
    [
      'exec',
      'prisma',
      'db',
      'push',
      '--schema',
      SCHEMA_PATH,
      '--skip-generate',
      '--accept-data-loss',
    ],
    {
      cwd: dbPackageDir,
      env: {
        ...process.env,
        CCT_DB_URL: `file:${file}`,
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
    },
  );
  templatePath = file;
  return file;
}

export interface TestDb {
  prisma: PrismaClient;
  url: string;
  cleanup(): Promise<void>;
}

export async function makeTestDb(): Promise<TestDb> {
  const tpl = await ensureTemplate();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cct-runner-test-'));
  const file = path.join(dir, `${randomUUID()}.db`);
  await fs.copyFile(tpl, file);
  const url = `file:${file}`;
  const prisma = new PrismaClient({
    datasources: { db: { url } },
    log: [],
  });
  return {
    prisma,
    url,
    async cleanup() {
      await prisma.$disconnect().catch(() => {});
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

export { SCHEMA_PATH };
