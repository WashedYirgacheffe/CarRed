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
      .from('carred_advisors')
      .select('id, name, avatar, personality, prompt, youtube_channel, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as {
      name: string;
      avatar?: string;
      personality?: string;
      prompt?: string;
      youtube_channel?: string;
    };

    if (!body.name) return res.status(400).json({ error: 'name is required' });

    const { data, error } = await supabaseAdmin
      .from('carred_advisors')
      .insert({ user_id: user.id, ...body })
      .select('id, name, avatar, personality, prompt, youtube_channel, created_at')
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? 'Insert failed' });
    return res.status(201).json(data);
  }

  allowMethods(res, ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
