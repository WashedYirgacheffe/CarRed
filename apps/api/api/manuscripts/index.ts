import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../src/auth';
import { supabaseAdmin } from '../../src/supabase';
import { allowMethods, noStore, setCors } from '../../src/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { space_id } = req.query as { space_id?: string };

    let query = supabaseAdmin
      .from('carred_manuscripts')
      .select('id, title, space_id, meta, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (space_id) query = query.eq('space_id', space_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as {
      title?: string;
      content?: string;
      space_id?: string;
      layout?: Record<string, unknown>;
      meta?: Record<string, unknown>;
    };

    const { data, error } = await supabaseAdmin
      .from('carred_manuscripts')
      .insert({
        user_id: user.id,
        title: body.title ?? '新稿件',
        content: body.content ?? '',
        space_id: body.space_id ?? null,
        layout: body.layout ?? {},
        meta: body.meta ?? {},
      })
      .select('id, title, space_id, meta, created_at, updated_at')
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? 'Insert failed' });
    return res.status(201).json(data);
  }

  allowMethods(res, ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
