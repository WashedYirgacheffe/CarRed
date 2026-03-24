import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { ApiTaskCreateRequest, TASK_STATUS } from '../../src/shared';
import { requireAuth } from '../../src/auth';
import { supabaseAdmin } from '../../src/supabase';
import { enqueueTask } from '../../src/queue';
import { allowMethods, noStore, setCors } from '../../src/http';

const schema = z.object({
  kind: z.enum(['chat_message', 'workspace_index', 'media_process', 'fs_write', 'fs_read', 'fs_list']),
  input: z.record(z.any()),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    allowMethods(res, ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = schema.safeParse(req.body as ApiTaskCreateRequest);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', detail: parsed.error.flatten() });
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('tasks')
    .insert({
      user_id: user.id,
      kind: parsed.data.kind,
      status: TASK_STATUS.queued,
      input: parsed.data.input,
      progress: 0,
    })
    .select('id, status')
    .single();

  if (insertError || !inserted) {
    return res.status(500).json({ error: 'Failed to create task', detail: insertError?.message });
  }

  const taskId = inserted.id as string;

  const { error: logError } = await supabaseAdmin
    .from('task_logs')
    .insert({ task_id: taskId, user_id: user.id, level: 'info', message: 'Task queued' });
  if (logError) {
    console.warn('[tasks] task_logs insert warning:', logError.message);
  }

  try {
    await enqueueTask(taskId, parsed.data.kind, {
      task_id: taskId,
      user_id: user.id,
      kind: parsed.data.kind,
      input: parsed.data.input,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await supabaseAdmin.from('tasks').update({ status: 'failed', error: detail }).eq('id', taskId);
    await supabaseAdmin.from('task_logs').insert({ task_id: taskId, user_id: user.id, level: 'error', message: detail });
    return res.status(500).json({ error: 'Task queue unavailable', detail });
  }

  return res.status(201).json({ task_id: taskId, status: inserted.status });
}
