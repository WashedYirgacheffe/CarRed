import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../../src/auth';
import { supabaseAdmin } from '../../../../src/supabase';
import { allowMethods, noStore, setCors } from '../../../../src/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query as { id: string };

  // GET: 获取单个会话（含消息）
  if (req.method === 'GET') {
    const { data: session, error: sErr } = await supabaseAdmin
      .from('carred_chat_sessions')
      .select('id, title, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (sErr || !session) return res.status(404).json({ error: 'Session not found' });

    const { data: messages } = await supabaseAdmin
      .from('carred_chat_messages')
      .select('id, role, content, metadata, created_at')
      .eq('session_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    return res.status(200).json({ ...session, messages: messages ?? [] });
  }

  // PATCH/PUT: 更新会话标题
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { title } = (req.body ?? {}) as { title?: string };
    if (!title) return res.status(400).json({ error: 'title is required' });

    const { data, error } = await supabaseAdmin
      .from('carred_chat_sessions')
      .update({ title })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, title, updated_at')
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? 'Update failed' });
    return res.status(200).json(data);
  }

  // DELETE: 删除会话（消息级联删除）
  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('carred_chat_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  allowMethods(res, ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}
