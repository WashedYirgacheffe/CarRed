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

  const { id } = req.query as { id: string };

  // GET: 获取稿件完整内容（含 content）
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('carred_manuscripts')
      .select('id, title, content, space_id, layout, meta, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Manuscript not found' });
    return res.status(200).json(data);
  }

  // PUT: 更新稿件
  if (req.method === 'PUT') {
    const body = (req.body ?? {}) as {
      title?: string;
      content?: string;
      layout?: Record<string, unknown>;
      meta?: Record<string, unknown>;
    };

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.layout !== undefined) updates.layout = body.layout;
    if (body.meta !== undefined) updates.meta = body.meta;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('carred_manuscripts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, title, space_id, meta, updated_at')
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? 'Update failed' });
    return res.status(200).json(data);
  }

  // DELETE: 删除稿件
  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('carred_manuscripts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  allowMethods(res, ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}
