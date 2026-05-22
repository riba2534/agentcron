import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const KEYCHAIN_SERVICE = 'com.cct.master';

export class KeychainUnavailableError extends Error {
  override readonly name = 'KeychainUnavailableError';
  readonly errorCode = 'CCT_SECRETS_KEYCHAIN_UNAVAILABLE';
}

export async function readFromKeychain(): Promise<Buffer | null> {
  try {
    const { stdout } = await execFile('security', [
      'find-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-w',
    ]);
    return Buffer.from(stdout.trim(), 'base64');
  } catch (e: unknown) {
    const stderr = (e as { stderr?: string }).stderr ?? '';
    // 不存在 → null（让 caller 决定是否生成）
    if (stderr.includes('could not be found')) return null;
    throw new KeychainUnavailableError(`security CLI failed: ${stderr || (e as Error).message}`);
  }
}

export async function writeToKeychain(account: string, key: Buffer): Promise<void> {
  try {
    await execFile('security', [
      'add-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      account,
      '-w',
      key.toString('base64'),
      '-U',
    ]);
  } catch (e: unknown) {
    const stderr = (e as { stderr?: string }).stderr ?? (e as Error).message;
    throw new KeychainUnavailableError(`security add-generic-password failed: ${stderr}`);
  }
}
