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

  if (req.method === 'PUT') {
    const body = (req.body ?? {}) as {
      name?: string;
      avatar?: string;
      personality?: string;
      prompt?: string;
      youtube_channel?: string;
    };

    const { data, error } = await supabaseAdmin
      .from('carred_advisors')
      .update(body)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name, avatar, personality, prompt, youtube_channel, created_at')
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? 'Update failed' });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('carred_advisors')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  allowMethods(res, ['PUT', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}
