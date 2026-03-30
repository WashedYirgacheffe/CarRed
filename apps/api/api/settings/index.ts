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

  // GET: 读取用户设置
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('carred_settings')
      .select('data, updated_at')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // 未找到行，返回空对象（首次使用）
      return res.status(200).json({ data: {} });
    }
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // PUT: 更新设置（upsert，整体替换 data 字段）
  if (req.method === 'PUT') {
    const { data: settingsData } = (req.body ?? {}) as { data?: Record<string, unknown> };
    if (!settingsData || typeof settingsData !== 'object') {
      return res.status(400).json({ error: 'data object is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('carred_settings')
      .upsert({ user_id: user.id, data: settingsData, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select('data, updated_at')
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? 'Upsert failed' });
    return res.status(200).json(data);
  }

  allowMethods(res, ['GET', 'PUT']);
  return res.status(405).json({ error: 'Method not allowed' });
}
