const TOKEN_KEY = 'carred.access_token';

export const readToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const saveToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

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
