import { router } from './init';
import { authRouter } from './auth';
import { taskRouter } from './task';
import { clarifyRouter } from './clarify';
import { modelAdapterRouter } from './modelAdapter';
import { taskRunRouter } from './taskRun';
import { systemRouter } from './system';

export const appRouter = router({
  auth: authRouter,
  task: taskRouter,
  clarify: clarifyRouter,
  modelAdapter: modelAdapterRouter,
  taskRun: taskRunRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
