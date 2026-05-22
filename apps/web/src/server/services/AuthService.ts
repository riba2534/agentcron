import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, type User } from '@cct/db';
import { CCT, cct } from '@cct/shared';
import { signSession } from '../trpc/session';

const PASSWORD_SCHEMA = z
  .string()
  .min(12)
  .max(256)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), {
    message: 'CCT_AUTH_WEAK_PASSWORD',
  });

const EMAIL_SCHEMA = z.string().email().max(255);

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const loginAttempts = new Map<string, number[]>();

function rateLimitKey(ip: string, email: string): string {
  return `${ip}:${email.toLowerCase()}`;
}

function consumeAttempt(key: string): boolean {
  const now = Date.now();
  const arr = loginAttempts.get(key) ?? [];
  const fresh = arr.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT_MAX) {
    loginAttempts.set(key, fresh);
    return false;
  }
  fresh.push(now);
  loginAttempts.set(key, fresh);
  return true;
}

function clearAttempts(key: string): void {
  loginAttempts.delete(key);
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  ip: string;
}

export interface AuthResult {
  userId: string;
  sessionToken: string;
}

export const AuthService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const email = EMAIL_SCHEMA.parse(input.email).toLowerCase();
    const passwordResult = PASSWORD_SCHEMA.safeParse(input.password);
    if (!passwordResult.success) {
      throw cct.badRequest(CCT.AUTH_WEAK_PASSWORD);
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw cct.conflict(CCT.AUTH_EMAIL_TAKEN);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: input.displayName ?? null,
      },
    });
    const sessionToken = await signSession(user.id);
    return { userId: user.id, sessionToken };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const email = EMAIL_SCHEMA.parse(input.email).toLowerCase();
    const key = rateLimitKey(input.ip, email);
    if (!consumeAttempt(key)) {
      throw cct.tooMany(CCT.AUTH_RATE_LIMIT);
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw cct.unauthorized(CCT.AUTH_INVALID_CREDENTIALS);
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw cct.unauthorized(CCT.AUTH_INVALID_CREDENTIALS);
    clearAttempts(key);
    const sessionToken = await signSession(user.id);
    return { userId: user.id, sessionToken };
  },

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw cct.unauthorized(CCT.AUTH_SESSION_EXPIRED);
    const passwordResult = PASSWORD_SCHEMA.safeParse(newPassword);
    if (!passwordResult.success) throw cct.badRequest(CCT.AUTH_WEAK_PASSWORD);
    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) throw cct.unauthorized(CCT.AUTH_INVALID_CREDENTIALS);
    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
  },

  async getById(userId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id: userId } });
  },

  __resetRateLimit(): void {
    loginAttempts.clear();
  },
};
