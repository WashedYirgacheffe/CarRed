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
    const { data, error } = await supabaseAdmin
      .from('carred_spaces')
      .select('id, name, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { name = '新空间' } = (req.body ?? {}) as { name?: string };

    const { data, error } = await supabaseAdmin
      .from('carred_spaces')
      .insert({ user_id: user.id, name })
      .select('id, name, created_at')
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? 'Insert failed' });
    return res.status(201).json(data);
  }

  allowMethods(res, ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
