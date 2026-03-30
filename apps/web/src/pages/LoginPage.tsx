import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface LoginPageProps {
  onLogin: (accessToken: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !data.session) {
      setError(authError?.message ?? '登录失败，请检查邮箱和密码');
      setLoading(false);
      return;
    }

    onLogin(data.session.access_token);
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <img src="/icon.png" alt="CarRed" className="w-8 h-8 rounded-lg" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span className="text-white text-xl font-semibold tracking-tight">CarRed</span>
          </div>
          <p className="text-[#666] text-sm">使用 carlab.top 账号登录</p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full bg-[#2a2a2a] text-white placeholder-[#555] rounded-lg px-4 py-3 text-sm border border-[#333] focus:outline-none focus:border-[#555] transition-colors"
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full bg-[#2a2a2a] text-white placeholder-[#555] rounded-lg px-4 py-3 text-sm border border-[#333] focus:outline-none focus:border-[#555] transition-colors"
          />

          {error && (
            <p className="text-red-400 text-xs px-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-white text-black rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        {/* 注册引导 */}
        <p className="text-center text-[#555] text-xs mt-6">
          还没有账号？前往{' '}
          <a
            href="https://carlab.top"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#888] hover:text-white transition-colors underline underline-offset-2"
          >
            carlab.top
          </a>{' '}
          注册
        </p>
      </div>
    </div>
  );
}
