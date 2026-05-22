import { SESSION_CONFIG } from './session';

export function setSessionCookie(headers: Headers, token: string): void {
  const parts = [
    `${SESSION_CONFIG.cookieName}=${token}`,
    `Path=/`,
    `Max-Age=${SESSION_CONFIG.ttlSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  headers.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(headers: Headers): void {
  headers.append(
    'Set-Cookie',
    `${SESSION_CONFIG.cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  );
}
