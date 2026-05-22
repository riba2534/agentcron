import { decrypt as aesDecrypt, encrypt as aesEncrypt } from './aesGcm.js';
import { getMasterKey } from './masterKey.js';

export interface SecretService {
  encrypt(plain: string): Promise<string>;
  decrypt(cipher: string): Promise<string>;
}

export function createSecretService(): SecretService {
  return {
    async encrypt(plain) {
      const key = await getMasterKey();
      return aesEncrypt(plain, key);
    },
    async decrypt(cipher) {
      const key = await getMasterKey();
      return aesDecrypt(cipher, key);
    },
  };
}

export const SecretService = createSecretService();

export { encrypt as aesEncrypt, decrypt as aesDecrypt, SecretsDecryptError } from './aesGcm.js';
export { getMasterKey, _resetMasterKeyCache } from './masterKey.js';
export { KeychainUnavailableError } from './keychain.js';
export { MasterKeyPermissionError } from './fileStore.js';
