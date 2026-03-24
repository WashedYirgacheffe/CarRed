import { Worker } from 'bullmq';
import { env } from './lib/env';
import { processTask } from './jobs/processTask';

const connection = { url: env.redisUrl };

const worker = new Worker('carred-tasks', processTask, {
  connection,
  concurrency: 8,
});

worker.on('ready', () => {
  console.log('[carred-worker] ready');
});

worker.on('completed', (job) => {
  console.log(`[carred-worker] completed job=${job.id} name=${job.name}`);
});

worker.on('failed', (job, err) => {
  console.error(`[carred-worker] failed job=${job?.id} name=${job?.name} err=${err.message}`);
});

process.on('SIGINT', async () => {
  await worker.close();
  process.exit(0);
});
