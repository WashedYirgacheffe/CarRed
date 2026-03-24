import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAnon } from './supabase';

export interface AuthUser {
  id: string;
  email?: string;
}

const getBearerToken = (req: VercelRequest): string | null => {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || typeof auth !== 'string') return null;
  const [type, token] = auth.split(' ');
  if (!type || !token || type.toLowerCase() !== 'bearer') return null;
  return token.trim();
};

export const requireAuth = async (req: VercelRequest, res: VercelResponse): Promise<AuthUser | null> => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return null;
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }

  return { id: data.user.id, email: data.user.email || undefined };
};
