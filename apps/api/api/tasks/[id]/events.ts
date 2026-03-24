import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../src/auth';
import { supabaseAdmin } from '../../../src/supabase';
import { allowMethods, setCors } from '../../../src/http';

export const config = { maxDuration: 60 };

const getParam = (raw: string | string[] | undefined): string => Array.isArray(raw) ? raw[0] || '' : raw || '';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    allowMethods(res, ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const id = getParam(req.query.id);
  if (!id) return res.status(400).json({ error: 'Missing task id' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const started = Date.now();
  const deadline = started + 55000;
  let lastStatus = '';

  while (Date.now() < deadline) {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('id,status,progress,output,error,updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      break;
    }

    if (!data) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Task not found' })}\n\n`);
      break;
    }

    const status = String(data.status || '');
    if (status !== lastStatus) {
      lastStatus = status;
      res.write(`event: status\ndata: ${JSON.stringify(data)}\n\n`);
    } else {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now(), progress: data.progress })}\n\n`);
    }

    if (['succeeded', 'failed', 'canceled'].includes(status)) break;
    await sleep(2000);
  }

  res.write('event: close\ndata: {}\n\n');
  res.end();
}
