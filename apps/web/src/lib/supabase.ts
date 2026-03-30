// 与 TapLater 保持相同配置，共享 .carlab.top 域下的登录状态
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://placeholder.supabase.co'
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'placeholder-key'

const isCarLabDomain =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'carlab.top' || window.location.hostname.endsWith('.carlab.top'))

const cookieStorage = {
  getItem(key: string): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.split('; ').find(row => row.startsWith(key + '='))
    if (!match) return null
    try { return decodeURIComponent(match.split('=').slice(1).join('=')) } catch { return null }
  },
  setItem(key: string, value: string): void {
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `${key}=${encodeURIComponent(value)}; domain=.carlab.top; path=/; expires=${expires}; SameSite=Lax; Secure`
  },
  removeItem(key: string): void {
    document.cookie = `${key}=; domain=.carlab.top; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isCarLabDomain ? cookieStorage : localStorage,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
