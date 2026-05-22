import { clarifyZod } from '@cct/shared';
import { protectedProcedure, router } from './init';
import { ClarifyService } from '../services/ClarifyService';
import { clarifySessionDto } from '../dto/index';

export const clarifyRouter = router({
  start: protectedProcedure
    .input(clarifyZod.clarifyStartInput)
    .mutation(async ({ ctx, input }) => {
      return ClarifyService.start(ctx.userId, input.rawInput, input.modelAdapterId);
    }),

  respond: protectedProcedure
    .input(clarifyZod.clarifyRespondInput)
    .mutation(async ({ ctx, input }) => {
      await ClarifyService.respond(ctx.userId, input.sessionId, input.userMessage);
      return { ok: true };
    }),

  confirm: protectedProcedure
    .input(clarifyZod.clarifyConfirmInput)
    .mutation(async ({ ctx, input }) => {
      await ClarifyService.confirm(ctx.userId, input.sessionId, input.finalSpec);
      return { ok: true };
    }),

  cancel: protectedProcedure
    .input(clarifyZod.clarifyCancelInput)
    .mutation(async ({ ctx, input }) => {
      await ClarifyService.cancel(ctx.userId, input.sessionId);
      return { ok: true };
    }),

  list: protectedProcedure
    .input(clarifyZod.clarifyListInput)
    .query(async ({ ctx, input }) => {
      const result = await ClarifyService.list(ctx.userId, {
        status: input.status,
        limit: input.limit,
      });
      return { items: result.items.map(clarifySessionDto) };
    }),
});
