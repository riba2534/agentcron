import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION_PREFIX = 'v1:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class SecretsDecryptError extends Error {
  override readonly name = 'SecretsDecryptError';
  readonly errorCode: string;
  constructor(errorCode: string, message: string) {
    super(message);
    this.errorCode = errorCode;
  }
}

export function encrypt(plain: string, masterKey: Buffer): string {
  if (masterKey.length !== 32) {
    throw new SecretsDecryptError('CCT_SECRETS_MASTER_KEY_MISSING', 'master key must be 32 bytes');
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(payload: string, masterKey: Buffer): string {
  if (!payload.startsWith(VERSION_PREFIX)) {
    throw new SecretsDecryptError(
      'CCT_SECRETS_UNKNOWN_VERSION',
      `unsupported cipher version: ${payload.slice(0, Math.min(payload.length, 4))}`,
    );
  }
  if (masterKey.length !== 32) {
    throw new SecretsDecryptError('CCT_SECRETS_MASTER_KEY_MISSING', 'master key must be 32 bytes');
  }
  const raw = Buffer.from(payload.slice(VERSION_PREFIX.length), 'base64');
  if (raw.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new SecretsDecryptError('CCT_SECRETS_DECRYPT_FAILED', 'cipher payload too short');
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const enc = raw.subarray(IV_LENGTH + TAG_LENGTH);
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (e: unknown) {
    throw new SecretsDecryptError(
      'CCT_SECRETS_DECRYPT_FAILED',
      `auth tag verification failed: ${(e as Error).message}`,
    );
  }
}

export const __INTERNAL = { ALGORITHM, VERSION_PREFIX, IV_LENGTH, TAG_LENGTH };
