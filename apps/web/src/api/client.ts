import { readToken } from '../lib/auth';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const request = async (path: string, init: RequestInit = {}) => {
  const token = readToken();
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${res.status})`);
  }

  return res.json();
};

export const api = {
  createTask: (kind: string, input: Record<string, unknown>) =>
    request('/api/tasks', { method: 'POST', body: JSON.stringify({ kind, input }) }),
  getTask: (id: string) => request(`/api/tasks/${id}`),
  sendChat: (sessionId: string, content: string, model?: string) =>
    request(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, model }),
    }),
};
