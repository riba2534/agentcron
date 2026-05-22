import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretsDecryptError, decrypt, encrypt } from './aesGcm.js';

const KEY = crypto.randomBytes(32);

describe('aesGcm', () => {
  it('roundtrip — encrypt → decrypt yields the same plaintext', () => {
    const plain = 'sk-test-token-1234567890';
    const cipher = encrypt(plain, KEY);
    expect(cipher.startsWith('v1:')).toBe(true);
    expect(decrypt(cipher, KEY)).toBe(plain);
  });

  it('rejects payload without v1: prefix', () => {
    expect(() => decrypt('foo:notavalidcipher', KEY)).toThrowError(SecretsDecryptError);
    try {
      decrypt('foo:notavalidcipher', KEY);
    } catch (e) {
      expect((e as SecretsDecryptError).errorCode).toBe('CCT_SECRETS_UNKNOWN_VERSION');
    }
  });

  it('rejects tampered tag (auth failure)', () => {
    const cipher = encrypt('sensitive', KEY);
    const raw = Buffer.from(cipher.slice(3), 'base64');
    // 翻转 tag 中第一个 byte
    raw[12] = raw[12]! ^ 0xff;
    const tampered = 'v1:' + raw.toString('base64');
    expect(() => decrypt(tampered, KEY)).toThrowError(/CCT_SECRETS_DECRYPT_FAILED|auth tag/);
  });

  it('rejects tampered iv', () => {
    const cipher = encrypt('sensitive', KEY);
    const raw = Buffer.from(cipher.slice(3), 'base64');
    raw[0] = raw[0]! ^ 0xff;
    const tampered = 'v1:' + raw.toString('base64');
    expect(() => decrypt(tampered, KEY)).toThrowError(SecretsDecryptError);
  });

  it('rejects wrong master key length', () => {
    expect(() => encrypt('x', Buffer.alloc(16))).toThrowError(/master key must be 32 bytes/);
  });
});
