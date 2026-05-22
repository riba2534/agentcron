import { modelAdapterZod } from '@cct/shared';
import { protectedProcedure, router } from './init';
import { ModelAdapterService } from '../services/ModelAdapterService';
import { AuditLogService } from '../services/AuditLogService';
import { modelAdapterDto } from '../dto/index';

export const modelAdapterRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const items = await ModelAdapterService.list(ctx.userId);
    return items.map(modelAdapterDto);
  }),

  upsert: protectedProcedure
    .input(modelAdapterZod.modelAdapterUpsertInput)
    .mutation(async ({ ctx, input }) => {
      const a = await ModelAdapterService.upsert(ctx.userId, input);
      await AuditLogService.log(
        'modelAdapter.upsert',
        { id: a.id, alias: a.alias, baseUrl: a.baseUrl, trustLevel: a.trustLevel },
        { userId: ctx.userId, ip: ctx.ip, userAgent: ctx.userAgent },
      );
      return modelAdapterDto(a);
    }),

  delete: protectedProcedure
    .input(modelAdapterZod.modelAdapterDeleteInput)
    .mutation(async ({ ctx, input }) => {
      await ModelAdapterService.delete(ctx.userId, input.id);
      await AuditLogService.log(
        'modelAdapter.delete',
        { id: input.id },
        { userId: ctx.userId, ip: ctx.ip, userAgent: ctx.userAgent },
      );
      return { ok: true };
    }),

  testConnection: protectedProcedure
    .input(modelAdapterZod.modelAdapterTestInput)
    .mutation(async ({ ctx, input }) => {
      return ModelAdapterService.testConnection(ctx.userId, input.id);
    }),
});
