import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../src/auth';
import { supabaseAdmin } from '../../../src/supabase';
import { allowMethods, noStore, setCors } from '../../../src/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  // GET: 列出当前用户的所有会话
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('carred_chat_sessions')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST: 创建新会话
  if (req.method === 'POST') {
    const { title = '新会话' } = (req.body ?? {}) as { title?: string };

    const { data, error } = await supabaseAdmin
      .from('carred_chat_sessions')
      .insert({ user_id: user.id, title })
      .select('id, title, created_at, updated_at')
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? 'Insert failed' });
    return res.status(201).json(data);
  }

  allowMethods(res, ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
