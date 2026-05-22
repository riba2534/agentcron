import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_KEY_PATH = path.join(os.homedir(), '.cct/master.key');

export class MasterKeyPermissionError extends Error {
  override readonly name = 'MasterKeyPermissionError';
  readonly errorCode = 'CCT_SECRETS_MASTER_KEY_MISSING';
}

export function getKeyFilePath(): string {
  const override = process.env.CCT_MASTER_KEY_PATH;
  return override ? override.replace(/^~(?=$|\/|\\)/, os.homedir()) : DEFAULT_KEY_PATH;
}

export async function readFromFile(): Promise<Buffer | null> {
  const keyPath = getKeyFilePath();
  try {
    const stat = await fs.stat(keyPath);
    // POSIX 权限校验：只接受 0600
    const mode = stat.mode & 0o777;
    if (mode !== 0o600) {
      throw new MasterKeyPermissionError(
        `master key file ${keyPath} has mode 0${mode.toString(8)}, expected 0600`,
      );
    }
    const data = await fs.readFile(keyPath, 'utf8');
    return Buffer.from(data.trim(), 'base64');
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeToFile(key: Buffer): Promise<void> {
  const keyPath = getKeyFilePath();
  await fs.mkdir(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(keyPath, key.toString('base64'), { mode: 0o600 });
}
