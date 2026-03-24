const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
};

export const env = {
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseAnonKey: requireEnv('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  redisUrl: requireEnv('REDIS_URL'),
  workspaceRoot: process.env.CARRED_WORKSPACE_ROOT || '/tmp/carred-workspaces',
  allowedOrigin: process.env.CARRED_ALLOWED_ORIGIN || 'https://carred.carlab.top',
};
