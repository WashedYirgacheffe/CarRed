import type { Job } from 'bullmq';
import type { TaskKind } from '../shared';
import { TASK_STATUS } from '../shared';
import { supabaseAdmin } from '../lib/supabase';

interface JobData {
  task_id: string;
  user_id: string;
  kind: TaskKind;
  input: Record<string, unknown>;
  session_id?: string;
  message?: string;
  model?: string | null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const writeLog = async (taskId: string, userId: string, level: 'info' | 'warn' | 'error', message: string) => {
  await supabaseAdmin.from('task_logs').insert({ task_id: taskId, user_id: userId, level, message });
};

const updateTask = async (taskId: string, patch: Record<string, unknown>) => {
  await supabaseAdmin.from('tasks').update(patch).eq('id', taskId);
};

const handleChatMessage = async (job: Job<JobData>) => {
  const { task_id, user_id, session_id, message } = job.data;

  await job.updateProgress(20);
  await updateTask(task_id, { status: TASK_STATUS.running, progress: 20 });
  await writeLog(task_id, user_id, 'info', 'Chat task started');

  await wait(900);

  const assistantText = `CarRed 已收到：${message || ''}\n\n这是 Worker 占位回复。下一步请接入真实 LLM provider。`;
  if (session_id) {
    await supabaseAdmin.from('chat_messages').insert({
      session_id,
      user_id,
      role: 'assistant',
      content: assistantText,
      metadata: { source: 'worker-placeholder' },
    });
  }

  await job.updateProgress(100);
  await updateTask(task_id, {
    status: TASK_STATUS.succeeded,
    progress: 100,
    output: { text: assistantText },
    error: null,
  });
  await writeLog(task_id, user_id, 'info', 'Chat task completed');
};

const handleGeneric = async (job: Job<JobData>) => {
  const { task_id, user_id, kind, input } = job.data;

  await job.updateProgress(25);
  await updateTask(task_id, { status: TASK_STATUS.running, progress: 25 });
  await writeLog(task_id, user_id, 'info', `Started task: ${kind}`);

  await wait(800);
  await job.updateProgress(75);
  await updateTask(task_id, { progress: 75 });

  await wait(600);
  await job.updateProgress(100);
  await updateTask(task_id, {
    status: TASK_STATUS.succeeded,
    progress: 100,
    output: { acknowledged: true, kind, input },
    error: null,
  });
  await writeLog(task_id, user_id, 'info', `Completed task: ${kind}`);
};

export const processTask = async (job: Job<JobData>) => {
  try {
    if (job.name === 'chat_message') {
      await handleChatMessage(job);
      return;
    }

    await handleGeneric(job);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateTask(job.data.task_id, {
      status: TASK_STATUS.failed,
      error: msg,
    });
    await writeLog(job.data.task_id, job.data.user_id, 'error', msg);
    throw error;
  }
};
