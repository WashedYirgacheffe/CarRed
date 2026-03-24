import { Queue } from 'bullmq';
import { env } from './env';

const connection = { url: env.redisUrl };

export const taskQueue = new Queue('carred-tasks', { connection });

export const enqueueTask = async (taskId: string, kind: string, payload: Record<string, unknown>) => {
  await taskQueue.add(
    kind,
    payload,
    {
      jobId: taskId,
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 2,
      backoff: { type: 'exponential', delay: 1500 },
    },
  );
};
