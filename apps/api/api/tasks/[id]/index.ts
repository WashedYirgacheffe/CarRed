import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../src/auth';
import { supabaseAdmin } from '../../../src/supabase';
import { allowMethods, noStore, setCors } from '../../../src/http';

const getParam = (raw: string | string[] | undefined): string => Array.isArray(raw) ? raw[0] || '' : raw || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    allowMethods(res, ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = getParam(req.query.id);
  if (!id) return res.status(400).json({ error: 'Missing task id' });

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('id,user_id,kind,status,input,output,error,progress,created_at,updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Task query failed', detail: error.message });
  if (!data) return res.status(404).json({ error: 'Task not found' });

  return res.status(200).json(data);
}
