import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { TASK_STATUS } from '../../../../src/shared';
import { requireAuth } from '../../../../src/auth';
import { supabaseAdmin } from '../../../../src/supabase';
import { enqueueTask } from '../../../../src/queue';
import { allowMethods, noStore, setCors } from '../../../../src/http';

const bodySchema = z.object({
  content: z.string().min(1),
  model: z.string().optional(),
});

const getParam = (raw: string | string[] | undefined): string => Array.isArray(raw) ? raw[0] || '' : raw || '';

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

  const sessionId = getParam(req.query.sessionId).trim();
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  const parsed = bodySchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', detail: parsed.error.flatten() });

  const nowIso = new Date().toISOString();
  const { error: upsertSessionError } = await supabaseAdmin
    .from('chat_sessions')
    .upsert({ id: sessionId, user_id: user.id, title: 'New Chat', updated_at: nowIso }, { onConflict: 'id' });
  if (upsertSessionError) return res.status(500).json({ error: 'Failed to upsert session', detail: upsertSessionError.message });

  const { error: insertMsgError } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      user_id: user.id,
      role: 'user',
      content: parsed.data.content,
      metadata: parsed.data.model ? { model: parsed.data.model } : {},
    });
  if (insertMsgError) return res.status(500).json({ error: 'Failed to append message', detail: insertMsgError.message });

  const { data: task, error: taskErr } = await supabaseAdmin
    .from('tasks')
    .insert({
      user_id: user.id,
      kind: 'chat_message',
      status: TASK_STATUS.queued,
      input: {
        session_id: sessionId,
        message: parsed.data.content,
        model: parsed.data.model || null,
      },
      progress: 0,
    })
    .select('id,status')
    .single();

  if (taskErr || !task) return res.status(500).json({ error: 'Failed to create task', detail: taskErr?.message });

  try {
    await enqueueTask(task.id, 'chat_message', {
      task_id: task.id,
      user_id: user.id,
      session_id: sessionId,
      message: parsed.data.content,
      model: parsed.data.model || null,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await supabaseAdmin.from('tasks').update({ status: 'failed', error: detail }).eq('id', task.id);
    await supabaseAdmin.from('task_logs').insert({ task_id: task.id, user_id: user.id, level: 'error', message: detail });
    return res.status(500).json({ error: 'Task queue unavailable', detail });
  }

  return res.status(202).json({
    session_id: sessionId,
    task_id: task.id,
    status: task.status,
  });
}
