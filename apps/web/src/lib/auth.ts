import { supabase } from './supabase';

const TOKEN_KEY = 'carred.access_token';

export const readToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const saveToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export const logout = async () => {
  clearToken();
  await supabase.auth.signOut();
};

// 保留：兼容旧的直链跳转场景（无 refresh_token 时的纯 token 写入）
export const hydrateTokenFromHash = () => {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (accessToken) {
    saveToken(accessToken);
    const clean = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, clean);
  }
};
