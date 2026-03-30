-- CarRed 云端存储建表 SQL
-- 在 Supabase 控制台 → SQL Editor 执行
-- 2026-03-30

-- 1. 聊天会话
CREATE TABLE IF NOT EXISTS carred_chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '新会话',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE carred_chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carred_chat_sessions_own" ON carred_chat_sessions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. 聊天消息
CREATE TABLE IF NOT EXISTS carred_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES carred_chat_sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE carred_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carred_chat_messages_own" ON carred_chat_messages
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. 用户设置（每人一行，upsert 更新）
CREATE TABLE IF NOT EXISTS carred_settings (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE carred_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carred_settings_own" ON carred_settings
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. 工作区空间
CREATE TABLE IF NOT EXISTS carred_spaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '默认空间',
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE carred_spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carred_spaces_own" ON carred_spaces
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. AI 顾问
CREATE TABLE IF NOT EXISTS carred_advisors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  avatar          TEXT,
  personality     TEXT,
  prompt          TEXT,
  youtube_channel TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE carred_advisors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carred_advisors_own" ON carred_advisors
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. 稿件
CREATE TABLE IF NOT EXISTS carred_manuscripts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  space_id    UUID REFERENCES carred_spaces(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '新稿件',
  content     TEXT DEFAULT '',
  layout      JSONB DEFAULT '{}',
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE carred_manuscripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carred_manuscripts_own" ON carred_manuscripts
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 自动更新 updated_at 触发器（chat_sessions + manuscripts）
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER carred_chat_sessions_updated_at
  BEFORE UPDATE ON carred_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER carred_manuscripts_updated_at
  BEFORE UPDATE ON carred_manuscripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
