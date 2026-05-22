import { jwtVerify, SignJWT } from 'jose';

const SESSION_COOKIE = 'cct_session';
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 天

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error('JWT_SECRET missing or too short (min 16 chars)');
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('cct')
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, getSecret(), { issuer: 'cct' });
  if (typeof payload.sub !== 'string') throw new Error('invalid session payload');
  return payload.sub;
}

export const SESSION_CONFIG = {
  cookieName: SESSION_COOKIE,
  ttlSeconds: SESSION_TTL_SEC,
};
