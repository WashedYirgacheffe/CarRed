import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';

const normalizeRelative = (input: string): string => {
  const normalized = path.posix.normalize(String(input || '').replace(/\\/g, '/'));
  const trimmed = normalized.replace(/^\/+/, '');
  if (!trimmed || trimmed === '.' || trimmed === '..' || trimmed.startsWith('../') || trimmed.includes('/../')) {
    throw new Error('Invalid workspace path');
  }
  return trimmed;
};

export const userWorkspaceDir = async (userId: string): Promise<string> => {
  const dir = path.join(env.workspaceRoot, userId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

export const resolveUserPath = async (userId: string, relPath: string): Promise<string> => {
  const base = await userWorkspaceDir(userId);
  const safeRel = normalizeRelative(relPath);
  const full = path.join(base, safeRel);
  const normalizedBase = path.resolve(base);
  const normalizedFull = path.resolve(full);
  if (!normalizedFull.startsWith(normalizedBase)) {
    throw new Error('Path escapes workspace root');
  }
  return normalizedFull;
};
