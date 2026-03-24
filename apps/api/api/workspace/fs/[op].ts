import fs from 'node:fs/promises';
import path from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../src/auth';
import { resolveUserPath, userWorkspaceDir } from '../../../src/workspace';
import { allowMethods, noStore, setCors } from '../../../src/http';

const getParam = (raw: string | string[] | undefined): string => Array.isArray(raw) ? raw[0] || '' : raw || '';

const safeStat = async (target: string) => {
  try {
    const stats = await fs.stat(target);
    return stats;
  } catch {
    return null;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    allowMethods(res, ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const op = getParam(req.query.op).trim();
  const body = (req.body || {}) as { path?: string; to?: string; content?: string };

  try {
    if (op === 'list') {
      const root = await userWorkspaceDir(user.id);
      const target = body.path ? await resolveUserPath(user.id, body.path) : root;
      const entries = await fs.readdir(target, { withFileTypes: true });
      return res.status(200).json({
        path: target,
        entries: entries.map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'dir' : 'file' })),
      });
    }

    if (!body.path) return res.status(400).json({ error: 'Missing path' });

    if (op === 'read') {
      const target = await resolveUserPath(user.id, body.path);
      const content = await fs.readFile(target, 'utf-8');
      return res.status(200).json({ path: body.path, content });
    }

    if (op === 'write') {
      const target = await resolveUserPath(user.id, body.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body.content || '', 'utf-8');
      const stats = await safeStat(target);
      return res.status(200).json({ path: body.path, bytes: stats?.size || 0 });
    }

    if (op === 'mkdir') {
      const target = await resolveUserPath(user.id, body.path);
      await fs.mkdir(target, { recursive: true });
      return res.status(200).json({ path: body.path, ok: true });
    }

    if (op === 'delete') {
      const target = await resolveUserPath(user.id, body.path);
      await fs.rm(target, { recursive: true, force: true });
      return res.status(200).json({ path: body.path, ok: true });
    }

    if (op === 'move') {
      if (!body.to) return res.status(400).json({ error: 'Missing target path' });
      const source = await resolveUserPath(user.id, body.path);
      const target = await resolveUserPath(user.id, body.to);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(source, target);
      return res.status(200).json({ from: body.path, to: body.to, ok: true });
    }

    return res.status(400).json({ error: `Unsupported op: ${op}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Workspace operation failed', detail: message });
  }
}
