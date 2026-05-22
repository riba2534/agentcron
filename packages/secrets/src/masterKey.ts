import crypto from 'node:crypto';
import os from 'node:os';
import { readFromFile, writeToFile } from './fileStore.js';
import { readFromKeychain, writeToKeychain } from './keychain.js';

let cachedKey: Buffer | null = null;

function shouldUseFile(): boolean {
  // 测试场景或显式覆盖时走文件路径，避免动用户 Keychain
  if (process.env.CCT_FORCE_FILE_MASTERKEY === '1') return true;
  return process.platform !== 'darwin';
}

export async function getMasterKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  if (!shouldUseFile()) {
    const existing = await readFromKeychain();
    if (existing) {
      cachedKey = existing;
      return existing;
    }
    const generated = crypto.randomBytes(32);
    await writeToKeychain(os.userInfo().username, generated);
    cachedKey = generated;
    return generated;
  }

  const existing = await readFromFile();
  if (existing) {
    cachedKey = existing;
    return existing;
  }
  const generated = crypto.randomBytes(32);
  await writeToFile(generated);
  cachedKey = generated;
  return generated;
}

// 测试 / 轮转用
export function _resetMasterKeyCache(): void {
  cachedKey = null;
}
