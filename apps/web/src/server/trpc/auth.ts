import { z } from 'zod';
import { CCT, cct } from '@cct/shared';
import { protectedProcedure, publicProcedure, router } from './init';
import { setSessionCookie, clearSessionCookie } from './cookies';
import { AuthService } from '../services/AuthService';
import { userDto } from '../dto/index';

const registerInput = z.object({
  email: z.string().email().max(255),
  password: z.string().min(12).max(256),
  displayName: z.string().min(1).max(80).optional(),
});

const loginInput = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(256),
});

const changePasswordInput = z.object({
  oldPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
});

export const authRouter = router({
  register: publicProcedure
    .input(registerInput)
    .mutation(async ({ ctx, input }) => {
      const result = await AuthService.register(input);
      setSessionCookie(ctx.resHeaders, result.sessionToken);
      return { userId: result.userId, sessionToken: result.sessionToken };
    }),

  login: publicProcedure
    .input(loginInput)
    .mutation(async ({ ctx, input }) => {
      const result = await AuthService.login({
        email: input.email,
        password: input.password,
        ip: ctx.ip ?? 'unknown',
      });
      setSessionCookie(ctx.resHeaders, result.sessionToken);
      return { userId: result.userId, sessionToken: result.sessionToken };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    clearSessionCookie(ctx.resHeaders);
    return { ok: true };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await AuthService.getById(ctx.userId);
    if (!user) throw cct.unauthorized(CCT.AUTH_SESSION_EXPIRED);
    return userDto(user);
  }),

  changePassword: protectedProcedure
    .input(changePasswordInput)
    .mutation(async ({ ctx, input }) => {
      await AuthService.changePassword(ctx.userId, input.oldPassword, input.newPassword);
      return { ok: true };
    }),
});
