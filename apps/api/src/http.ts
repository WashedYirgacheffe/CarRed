import type { VercelResponse } from '@vercel/node';
import { env } from './env';

export const allowMethods = (res: VercelResponse, allowed: string[]) => {
  res.setHeader('Allow', allowed.join(', '));
};

export const noStore = (res: VercelResponse) => {
  res.setHeader('Cache-Control', 'no-store');
};

export const setCors = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', env.allowedOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
};
