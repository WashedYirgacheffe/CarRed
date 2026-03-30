# CarRed 线上化分析

> 日期: 2026-03-30 · 基于当前代码状态的分析

---

## 一、当前上线状态诊断

### 已上线 / 已就绪

| 层级 | 状态 | 说明 |
|------|------|------|
| Web 前端 | ✅ 已部署 | carred.carlab.top HTTP 200，可正常访问 |
| Supabase 数据库 | ✅ Schema 就绪 | SQL 迁移文件已有完整表结构和 RLS 策略 |
| API 认证层 | ✅ 代码完整 | `requireAuth` 校验 Supabase Bearer JWT，逻辑正确 |
| API 任务路由 | ✅ 代码完整 | `/api/tasks`, `/api/workspace/fs/*`, `/api/chat/sessions/*/messages` 均有代码 |
| API 部署 | ⚠️ 未知 | carred-api 项目是否已 `vercel --prod` 部署需确认 |

### 骨架 / 占位状态（功能不可用）

| 层级 | 问题 | 影响 |
|------|------|------|
| Worker 任务处理 | `processTask.ts` 全为占位：chat_message 返回固定字符串，等 900ms | 聊天无真实 AI 响应 |
| 前端无登录入口 | 无 Login 页面，token 依赖 URL hash（来自 TapLater 跳转） | 直接访问 carred.carlab.top 无法登录 |
| 数据存全在 localStorage | browserIpcRenderer.ts 的所有 invoke 均操作 localStorage | 换设备/清缓存数据丢失，无账号绑定 |
| 知识库 / 技能表 | SQL 中无 knowledge / skills 表定义 | 知识库和技能数据无法云端化 |
| 稿件文件系统 | 当前通过 `/api/workspace/fs/*` 有代码，但 Worker FS 逻辑是占位 | 稿件文件无实际服务端存储 |

### 核心判断

> CarRed 当前是**一个可访问但无实际功能的前端壳**。
> 所有数据仍在 localStorage，Worker 是占位，没有登录门槛。
> 需要按优先级推进：认证登录 → 数据云端化 → AI 真实响应。

---

## 二、登录方案

### 现有基础

`apps/web/src/lib/auth.ts` 已实现：
- `readToken()` / `saveToken()` — localStorage 存取 JWT
- `hydrateTokenFromHash()` — 从 URL `#access_token=...` 提取 token（TapLater 跳转用）
- `readFallbackSupabaseToken()` — 自动找 localStorage 中已有的 Supabase session

后端 `requireAuth` 已实现：用 Supabase Anon Client 校验 Bearer JWT。

### 推荐方案：双轨认证

#### 轨道 A：TapLater SSO 跳转（复用现有，无需开发）
```
用户在 carlab.top 已登录
→ 点击"进入 CarRed"入口
→ 跳转 carred.carlab.top#access_token={jwt}&refresh_token={rt}
→ hydrateTokenFromHash() 提取并存入 localStorage
→ 正常使用
```
**优点**: 零开发，统一 CarLab 生态入口体验。
**缺点**: 用户无法直接在 CarRed 独立登录。

#### 轨道 B：CarRed 独立登录页（需开发，优先级中）

**方案**: 在 App.tsx 加认证守卫，无 token 时渲染 `<LoginPage />`

```tsx
// App.tsx 改造
function App() {
  const [token, setToken] = useState<string | null>(readToken);

  // 先尝试从 hash 恢复（SSO 跳转）
  useEffect(() => {
    hydrateTokenFromHash();
    setToken(readToken());
  }, []);

  if (!token) return <LoginPage onLogin={setToken} />;
  return <Layout ...>;
}
```

**LoginPage 实现要点**:
```tsx
// 用 @supabase/supabase-js 前端 SDK
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)

// 邮箱+密码登录
const { data, error } = await supabase.auth.signInWithPassword({ email, password })
if (data.session) {
  saveToken(data.session.access_token)
  onLogin(data.session.access_token)
}
```

**需要新增的前端依赖**:
```
@supabase/supabase-js  (apps/web package.json)
```

**需要新增的环境变量**（Vercel Web 项目）:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

**建议**: 先走轨道 A（TapLater 入口跳转）上线，轨道 B 作为后续迭代。

---

## 三、存储云端化方案

### 3.1 架构定位

```
当前: 所有操作 → localStorage (browserIpcRenderer.ts)
目标: 需要持久化的数据 → API → Supabase
      纯 UI 状态 → 保留 localStorage
```

**原则**: 不要一次性全量迁移。按模块优先级逐步替换 `browserIpcRenderer.ts` 中的对应 `invoke` 实现。

---

### 3.2 数据分类与迁移优先级

#### P0 — 立即迁移（核心数据，丢失影响大）

**聊天会话 + 消息** (`chat_sessions` + `chat_messages` 表已就绪)

| 当前 localStorage key | 目标 Supabase 表 | API 路径 |
|----------------------|----------------|---------|
| `carred.web.chat.sessions` | `chat_sessions` | `POST /api/chat/sessions` |
| `carred.web.chat.sessions[].messages` | `chat_messages` | `POST /api/chat/sessions/:id/messages` |

迁移方式: 将 `browserIpcRenderer.ts` 中 `chat.getSessions` / `chat.getMessages` / `chat.send` 改为调用 API，API 写 Supabase。

**用户设置** (`user_settings` 表已就绪)

| 当前 | 目标 |
|------|------|
| `carred.web.settings` (localStorage) | `user_settings` 表，按 `user_id` 隔离 |

#### P1 — 次优先级

**稿件文件系统** — `/api/workspace/fs/*` API 已存在，Worker 需实现实际读写

当前 Worker 的 `processTask.ts` 处理 `fs_write` / `fs_read` 是占位。
需要将 Worker 的文件操作改为写入 **Supabase Storage** 或 Worker 本地文件系统（取决于 Worker 平台）。

**Supabase Storage 方案**（推荐）:
```
Bucket: carred-workspaces
路径格式: {user_id}/manuscripts/{path}
```
Worker 处理 `fs_write` 时 → `supabase.storage.from('carred-workspaces').upload(path, content)`

**智囊团 Advisors** — 需要新建 Supabase 表（当前 SQL 中无 advisors 表）

```sql
-- 新增迁移文件: 20260330_0002_add_advisors.sql
create table public.advisors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  avatar text,
  personality text,
  prompt text,
  created_at timestamptz default now()
);
alter table public.advisors enable row level security;
create policy "users can manage own advisors"
  on public.advisors for all using (auth.uid() = user_id);
```

#### P2 — 后续迭代

**知识库** — 需新建 `knowledge_notes` 表（含 vector embedding 列，用于向量检索）

```sql
-- 需安装 pgvector 扩展
create extension if not exists vector;
create table public.knowledge_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text,           -- 'xhs' | 'youtube'
  title text,
  content text,
  url text,
  embedding vector(1536), -- 用于相似度搜索
  created_at timestamptz default now()
);
```

**技能库 Skills** — 需新建 `skills` 表

**Wander 历史** — 可复用 `archives` 表（已有），加 `type = 'wander'` 字段区分

---

### 3.3 迁移实施路径（分步）

```
第一步（当前可做）:
  ├── 添加 Supabase 前端 SDK
  ├── 添加 LoginPage 组件
  └── App.tsx 加认证守卫

第二步:
  ├── browserIpcRenderer.ts: chat.getSessions/getMessages → 调 API
  ├── browserIpcRenderer.ts: settings.load/save → 调 API (user_settings)
  └── API + Worker: 实现真实的 chat_message 处理（接入 AI）

第三步:
  ├── 新建 advisors SQL 迁移
  ├── browserIpcRenderer.ts: advisors.* → 调 API
  ├── Worker: 实现 fs_write/fs_read（Supabase Storage）
  └── browserIpcRenderer.ts: manuscripts.* → 调 /api/workspace/fs/*（已有路由）

第四步:
  ├── knowledge_notes 表 + pgvector
  ├── skills 表
  └── 各模块 API 化
```

---

## 四、当前工程骨架缺口汇总

下一步实现 AI 真实响应前，需要先解决：

| 缺口 | 位置 | 工作量 |
|------|------|--------|
| 前端无 Supabase 客户端 | apps/web | 小（加依赖 + createClient） |
| 前端无登录页 | apps/web/src/pages/LoginPage.tsx | 中（UI + auth 逻辑） |
| App.tsx 无认证守卫 | apps/web/src/App.tsx | 小 |
| TapLater 入口跳转按钮 | TapLater（另一仓库） | 小 |
| API 项目未确认是否已部署 | Vercel carred-api 项目 | 需确认 |
| Worker 无真实 AI 调用 | apps/worker/src/jobs/processTask.ts | 大（下一阶段） |
| knowledge/skills SQL 迁移 | infra/supabase/migrations/ | 中 |
| Supabase Storage bucket 未创建 | Supabase Dashboard | 小 |

---

## 五、下一步：复用 CarLab AI API 接口

> 待在登录 + 基础存储就绪后推进

CarLab (TapLater) 已有成熟的 AI API 接入层：
- 硅基流动 (`/api-silicon`)
- DMX API (`/api-dmx`)
- 无音科技 (`/api-wuyinkeji`)
- NodeyHub (`/api-nodyhub`)

**复用路径**:
1. Worker 的 `processTask.ts` 处理 `chat_message` 时，通过 HTTP 调用以上任意 AI 接口
2. 具体 AI 提供商和 API Key 通过 Worker 环境变量注入（不暴露给前端）
3. 用户在 CarRed Settings 中选择模型 → 设置存入 `user_settings.model_name` → Worker 读取后分发

**接口格式**: CarLab 的文字 API 返回 OpenAI 兼容格式 `choices[0].message.content`，Worker 侧直接对接即可。
