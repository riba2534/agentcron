import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { prisma } from '@cct/db';
import { CCT, cct, taskZod } from '@cct/shared';
import { protectedProcedure, router } from './init';
import { taskRunDto } from '../dto/index';

const taskRunGetInput = z.object({ id: z.string().min(1) });

async function ownsTaskRun(userId: string, runId: string): Promise<{ taskId: string; logFilePath: string | null } | null> {
  const run = await prisma.taskRun.findUnique({
    where: { id: runId },
    select: { taskId: true, logFilePath: true, task: { select: { userId: true } } },
  });
  if (!run) return null;
  if (run.task.userId !== userId) return null;
  return { taskId: run.taskId, logFilePath: run.logFilePath };
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export const taskRunRouter = router({
  list: protectedProcedure
    .input(taskZod.taskRunListInput)
    .query(async ({ ctx, input }) => {
      const task = await prisma.task.findFirst({
        where: { id: input.taskId, userId: ctx.userId },
        select: { id: true },
      });
      if (!task) throw cct.notFound(CCT.TASK_NOT_FOUND);
      const limit = input.limit;
      const items = await prisma.taskRun.findMany({
        where: {
          taskId: input.taskId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { startedAt: 'desc' },
        take: limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      let nextCursor: string | undefined;
      if (items.length > limit) {
        const overflow = items.pop();
        nextCursor = overflow?.id;
      }
      return { items: items.map(taskRunDto), nextCursor };
    }),

  get: protectedProcedure
    .input(taskRunGetInput)
    .query(async ({ ctx, input }) => {
      const owned = await ownsTaskRun(ctx.userId, input.id);
      if (!owned) throw cct.notFound(CCT.RUN_NOT_FOUND);
      const run = await prisma.taskRun.findUnique({ where: { id: input.id } });
      if (!run) throw cct.notFound(CCT.RUN_NOT_FOUND);
      return taskRunDto(run);
    }),

  tailLog: protectedProcedure
    .input(taskZod.taskRunTailLogInput)
    .query(async ({ ctx, input }) => {
      const owned = await ownsTaskRun(ctx.userId, input.id);
      if (!owned) throw cct.notFound(CCT.RUN_NOT_FOUND);
      if (!owned.logFilePath) {
        throw cct.notFound(CCT.RUN_LOG_MISSING);
      }
      let raw: string;
      try {
        const buf = await fs.readFile(owned.logFilePath, 'utf8');
        raw = normalizeNewlines(buf);
      } catch {
        throw cct.notFound(CCT.RUN_LOG_MISSING);
      }
      const lines = raw.split('\n');
      const offset = Math.min(input.offset, lines.length);
      const slice = lines.slice(offset, offset + input.lines);
      const reachedEnd = offset + slice.length >= lines.length;
      return { lines: slice, reachedEnd };
    }),
});
