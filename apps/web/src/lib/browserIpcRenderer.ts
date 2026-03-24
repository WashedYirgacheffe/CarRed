import { hydrateTokenFromHash, readToken, saveToken } from './auth';

type Listener = (...args: any[]) => void;

type ChatSessionRecord = {
  id: string;
  title: string;
  updatedAt: string;
};

type StoredChatMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  display_content?: string;
  attachment?: unknown;
  created_at: string;
};

type SpaceRecord = {
  id: string;
  name: string;
};

type ChatRunState = {
  isProcessing: boolean;
  partialResponse: string;
  updatedAt: number;
  abortController?: AbortController;
};

type ChatSendPayload = {
  sessionId?: string;
  message: string;
  displayContent?: string;
  attachment?: unknown;
  modelConfig?: unknown;
};

type ChatRoom = {
  id: string;
  name: string;
  advisorIds: string[];
  createdAt: string;
  isSystem?: boolean;
  systemType?: string;
};

type Advisor = {
  id: string;
  name: string;
  avatar: string;
  personality: string;
  prompt?: string;
  youtubeChannel?: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const SETTINGS_KEY = 'carred.web.settings';
const SPACES_KEY = 'carred.web.spaces';
const ACTIVE_SPACE_KEY = 'carred.web.active_space';
const CHAT_SESSIONS_KEY = 'carred.web.chat.sessions';
const CONTEXT_SESSION_MAP_KEY = 'carred.web.chat.context-map';
const ROOMS_KEY = 'carred.web.chatrooms';
const ADVISORS_KEY = 'carred.web.advisors';
const MEMORIES_KEY = 'carred.web.memories';
const WANDER_HISTORY_KEY = 'carred.web.wander.history';
const MANUSCRIPT_LAYOUT_PREFIX = 'carred.web.manuscripts.layout.';
const MANUSCRIPT_METADATA_PREFIX = 'carred.web.manuscripts.meta.';
const SKILLS_KEY = 'carred.web.skills';

const listeners = new Map<string, Set<Listener>>();
const chatRuntimeBySession = new Map<string, ChatRunState>();

const DEFAULT_SETTINGS = {
  api_endpoint: '',
  api_key: '',
  model_name: '',
  workspace_dir: '/workspace',
  image_provider: 'openai-compatible',
  image_endpoint: '',
  image_api_key: '',
  image_model: 'gpt-image-1',
  image_size: '1024x1024',
  image_quality: 'standard',
  redclaw_compact_target_tokens: 256000,
};

const DEFAULT_SPACES: SpaceRecord[] = [{ id: 'default', name: 'Default Space' }];

const DEFAULT_ADVISORS: Advisor[] = [
  { id: 'advisor-1', name: '内容策略师', avatar: '策', personality: '聚焦选题与结构化表达' },
  { id: 'advisor-2', name: '品牌增长师', avatar: '增', personality: '关注转化与增长策略' },
  { id: 'advisor-3', name: '视觉创意师', avatar: '视', personality: '优化视觉叙事与封面方向' },
];

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const nowIso = () => new Date().toISOString();

const randomId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizePath = (value: string | undefined | null): string => String(value || '')
  .split('/')
  .map((part) => part.trim())
  .filter(Boolean)
  .join('/');

const joinPath = (...parts: Array<string | undefined | null>): string => normalizePath(parts.map((part) => String(part || '')).join('/'));

const emit = (channel: string, payload?: unknown) => {
  const bucket = listeners.get(channel);
  if (!bucket) return;
  for (const fn of bucket) {
    try {
      fn(undefined, payload);
    } catch (error) {
      console.error(`[browser-ipc] listener error on ${channel}:`, error);
    }
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readFallbackSupabaseToken = (): string | null => {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.includes('-auth-token')) continue;
      const value = localStorage.getItem(key);
      if (!value) continue;
      try {
        const parsed = JSON.parse(value) as any;
        if (parsed?.access_token && typeof parsed.access_token === 'string') {
          return parsed.access_token;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }
  return null;
};

const getAccessToken = (): string | null => {
  let token = readToken();
  if (token) return token;
  token = readFallbackSupabaseToken();
  if (token) saveToken(token);
  return token;
};

const requestJson = async (path: string, init: RequestInit = {}, options?: { tolerateStatuses?: number[] }) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');

  const token = getAccessToken();
  if (token) headers.set('authorization', `Bearer ${token}`);

  const url = `${API_BASE}${path}`;
  const response = await fetch(url, { ...init, headers });
  const tolerateStatuses = options?.tolerateStatuses || [];
  if (!response.ok && !tolerateStatuses.includes(response.status)) {
    const payload = await response.json().catch(() => ({}));
    throw new Error((payload as any).error || `Request failed (${response.status})`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
};

const ensureSpaces = (): SpaceRecord[] => {
  const spaces = readJson<SpaceRecord[]>(SPACES_KEY, []);
  if (spaces.length > 0) return spaces;
  writeJson(SPACES_KEY, DEFAULT_SPACES);
  if (!localStorage.getItem(ACTIVE_SPACE_KEY)) {
    localStorage.setItem(ACTIVE_SPACE_KEY, DEFAULT_SPACES[0].id);
  }
  return DEFAULT_SPACES;
};

const getActiveSpaceId = (): string => {
  const spaces = ensureSpaces();
  const active = localStorage.getItem(ACTIVE_SPACE_KEY);
  if (active && spaces.some((space) => space.id === active)) return active;
  localStorage.setItem(ACTIVE_SPACE_KEY, spaces[0].id);
  return spaces[0].id;
};

const getManuscriptRoot = () => joinPath('spaces', getActiveSpaceId(), 'manuscripts');

const workspaceFs = async (op: string, payload: Record<string, unknown>) => {
  if (!API_BASE) {
    throw new Error('VITE_API_BASE_URL is not configured');
  }
  return requestJson(`/api/workspace/fs/${op}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

const manuscriptsMetadataKey = () => `${MANUSCRIPT_METADATA_PREFIX}${getActiveSpaceId()}`;

const readManuscriptMetadata = (): Record<string, unknown> => readJson<Record<string, unknown>>(manuscriptsMetadataKey(), {});

const writeManuscriptMetadata = (value: Record<string, unknown>) => {
  writeJson(manuscriptsMetadataKey(), value);
};

const manuscriptsLayoutKey = () => `${MANUSCRIPT_LAYOUT_PREFIX}${getActiveSpaceId()}`;

const readSessions = (): ChatSessionRecord[] => readJson<ChatSessionRecord[]>(CHAT_SESSIONS_KEY, []);

const writeSessions = (sessions: ChatSessionRecord[]) => {
  const sorted = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  writeJson(CHAT_SESSIONS_KEY, sorted);
};

const readSessionMessages = (sessionId: string): StoredChatMessage[] =>
  readJson<StoredChatMessage[]>(`${CHAT_SESSIONS_KEY}.${sessionId}.messages`, []);

const writeSessionMessages = (sessionId: string, messages: StoredChatMessage[]) => {
  writeJson(`${CHAT_SESSIONS_KEY}.${sessionId}.messages`, messages);
};

const touchSession = (sessionId: string, titleHint?: string) => {
  const sessions = readSessions();
  const index = sessions.findIndex((session) => session.id === sessionId);
  const updatedAt = nowIso();
  if (index >= 0) {
    sessions[index] = {
      ...sessions[index],
      title: titleHint || sessions[index].title,
      updatedAt,
    };
  } else {
    sessions.unshift({
      id: sessionId,
      title: titleHint || 'New Chat',
      updatedAt,
    });
  }
  writeSessions(sessions);
};

const createSessionRecord = (title = 'New Chat'): ChatSessionRecord => {
  const session: ChatSessionRecord = {
    id: randomId('session'),
    title,
    updatedAt: nowIso(),
  };
  writeSessions([session, ...readSessions()]);
  writeSessionMessages(session.id, []);
  return session;
};

const appendMessage = (sessionId: string, message: Omit<StoredChatMessage, 'id' | 'created_at' | 'session_id'> & { id?: string }) => {
  const list = readSessionMessages(sessionId);
  const created_at = nowIso();
  const next: StoredChatMessage = {
    id: message.id || randomId('msg'),
    session_id: sessionId,
    role: message.role,
    content: message.content,
    display_content: message.display_content,
    attachment: message.attachment,
    created_at,
  };
  writeSessionMessages(sessionId, [...list, next]);
  touchSession(sessionId);
  return next;
};

const setRuntime = (sessionId: string, patch: Partial<ChatRunState>) => {
  const prev = chatRuntimeBySession.get(sessionId) || {
    isProcessing: false,
    partialResponse: '',
    updatedAt: Date.now(),
  };
  chatRuntimeBySession.set(sessionId, {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  });
};

const chunkText = async (sessionId: string, text: string) => {
  const chunkSize = 26;
  let partial = '';
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    partial += chunk;
    setRuntime(sessionId, { isProcessing: true, partialResponse: partial });
    emit('chat:response-chunk', { content: chunk });
    await sleep(35);
  }
};

const parseTaskAssistantText = (task: any): string => {
  const text = task?.output?.text;
  if (typeof text === 'string' && text.trim()) return text;
  if (typeof task?.error === 'string' && task.error.trim()) return `任务失败：${task.error}`;
  return 'CarRed 已收到请求，但目前仍是占位 Worker 返回。';
};

const pollTask = async (taskId: string, signal?: AbortSignal): Promise<any> => {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error('cancelled');
    }
    const task = await requestJson(`/api/tasks/${taskId}`, { method: 'GET' });
    const status = String((task as any)?.status || '');
    if (['succeeded', 'failed', 'canceled'].includes(status)) return task;
    await sleep(1200);
  }
  throw new Error('Task timeout');
};

const upsertRoom = (room: ChatRoom): ChatRoom[] => {
  const list = readJson<ChatRoom[]>(ROOMS_KEY, []);
  const index = list.findIndex((item) => item.id === room.id);
  if (index >= 0) {
    list[index] = room;
  } else {
    list.push(room);
  }
  writeJson(ROOMS_KEY, list);
  return list;
};

const roomMessagesKey = (roomId: string) => `${ROOMS_KEY}.${roomId}.messages`;

const listRooms = (): ChatRoom[] => readJson<ChatRoom[]>(ROOMS_KEY, []);

const listAdvisors = (): Advisor[] => {
  const stored = readJson<Advisor[]>(ADVISORS_KEY, []);
  if (stored.length > 0) return stored;
  writeJson(ADVISORS_KEY, DEFAULT_ADVISORS);
  return DEFAULT_ADVISORS;
};

const notMigrated = async (feature: string) => {
  throw new Error(`${feature} 尚未完成 Web 化迁移`);
};

const handleInvoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
  switch (channel) {
    case 'spaces:list': {
      const spaces = ensureSpaces();
      return { spaces, activeSpaceId: getActiveSpaceId() };
    }
    case 'spaces:switch': {
      const nextSpaceId = String(args[0] || '');
      const spaces = ensureSpaces();
      const exists = spaces.some((space) => space.id === nextSpaceId);
      if (!exists) return { success: false, error: 'Space not found' };
      localStorage.setItem(ACTIVE_SPACE_KEY, nextSpaceId);
      emit('space:changed', { activeSpaceId: nextSpaceId });
      return { success: true };
    }
    case 'spaces:create': {
      const name = String(args[0] || '').trim();
      if (!name) return { success: false, error: 'Space name is required' };
      const spaces = ensureSpaces();
      const newSpace = { id: randomId('space'), name };
      writeJson(SPACES_KEY, [...spaces, newSpace]);
      return { success: true, space: newSpace };
    }
    case 'spaces:rename': {
      const payload = (args[0] || {}) as { id?: string; name?: string };
      const id = String(payload.id || '');
      const name = String(payload.name || '').trim();
      if (!id || !name) return { success: false, error: 'Invalid payload' };
      const spaces = ensureSpaces();
      const index = spaces.findIndex((space) => space.id === id);
      if (index < 0) return { success: false, error: 'Space not found' };
      spaces[index] = { ...spaces[index], name };
      writeJson(SPACES_KEY, spaces);
      emit('space:changed', { activeSpaceId: getActiveSpaceId() });
      return { success: true };
    }

    case 'manuscripts:list': {
      const root = getManuscriptRoot();
      await workspaceFs('mkdir', { path: root });

      const walk = async (relative = ''): Promise<any[]> => {
        const fullPath = relative ? joinPath(root, relative) : root;
        const result = await workspaceFs('list', { path: fullPath }) as any;
        const entries = Array.isArray(result?.entries) ? result.entries : [];
        const nodes = await Promise.all(entries.map(async (entry: any) => {
          const name = String(entry.name || '');
          const nodeRelativePath = relative ? joinPath(relative, name) : name;
          if (entry.type === 'dir') {
            const children = await walk(nodeRelativePath);
            return {
              name,
              path: nodeRelativePath,
              isDirectory: true,
              children,
            };
          }
          return {
            name,
            path: nodeRelativePath,
            isDirectory: false,
          };
        }));
        return nodes.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return String(a.name).localeCompare(String(b.name));
        });
      };

      return walk('');
    }
    case 'manuscripts:read': {
      const path = normalizePath(String(args[0] || ''));
      if (!path) return { content: '', metadata: {} };
      const result = await workspaceFs('read', { path: joinPath(getManuscriptRoot(), path) }) as any;
      const metadataMap = readManuscriptMetadata();
      return {
        content: String(result?.content || ''),
        metadata: (metadataMap[path] as Record<string, unknown>) || {},
      };
    }
    case 'manuscripts:save': {
      const payload = (args[0] || {}) as { path?: string; content?: string; metadata?: unknown };
      const path = normalizePath(payload.path);
      if (!path) return { success: false, error: 'path is required' };
      await workspaceFs('write', {
        path: joinPath(getManuscriptRoot(), path),
        content: String(payload.content || ''),
      });
      if (payload.metadata && typeof payload.metadata === 'object') {
        const map = readManuscriptMetadata();
        map[path] = payload.metadata;
        writeManuscriptMetadata(map);
      }
      return { success: true };
    }
    case 'manuscripts:create-folder': {
      const payload = (args[0] || {}) as { parentPath?: string; name?: string };
      const folderPath = joinPath(payload.parentPath, payload.name);
      await workspaceFs('mkdir', { path: joinPath(getManuscriptRoot(), folderPath) });
      return { success: true, path: folderPath };
    }
    case 'manuscripts:create-file': {
      const payload = (args[0] || {}) as { parentPath?: string; name?: string };
      const filePath = joinPath(payload.parentPath, payload.name);
      await workspaceFs('write', { path: joinPath(getManuscriptRoot(), filePath), content: '' });
      return { success: true, path: filePath };
    }
    case 'manuscripts:delete': {
      const filePath = normalizePath(String(args[0] || ''));
      if (!filePath) return { success: false, error: 'path is required' };
      await workspaceFs('delete', { path: joinPath(getManuscriptRoot(), filePath) });
      return { success: true };
    }
    case 'manuscripts:rename': {
      const payload = (args[0] || {}) as { oldPath?: string; newName?: string };
      const oldPath = normalizePath(payload.oldPath);
      const newName = String(payload.newName || '').trim();
      if (!oldPath || !newName) return { success: false, error: 'Invalid payload' };

      const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : '';
      const newPath = joinPath(parent, newName);

      await workspaceFs('move', {
        path: joinPath(getManuscriptRoot(), oldPath),
        to: joinPath(getManuscriptRoot(), newPath),
      });

      const metadataMap = readManuscriptMetadata();
      if (metadataMap[oldPath]) {
        metadataMap[newPath] = metadataMap[oldPath];
        delete metadataMap[oldPath];
        writeManuscriptMetadata(metadataMap);
      }

      return { success: true, newPath };
    }
    case 'manuscripts:get-layout': {
      return readJson<Record<string, { x: number; y: number }>>(manuscriptsLayoutKey(), {});
    }
    case 'manuscripts:save-layout': {
      const payload = (args[0] || {}) as Record<string, { x: number; y: number }>;
      writeJson(manuscriptsLayoutKey(), payload || {});
      return { success: true };
    }

    case 'chat:getOrCreateFileSession': {
      const payload = (args[0] || {}) as { filePath?: string; fileId?: string };
      const key = `file:${payload.fileId || payload.filePath || randomId('file')}`;
      const mapping = readJson<Record<string, string>>(CONTEXT_SESSION_MAP_KEY, {});
      const mapped = mapping[key];
      if (mapped && readSessions().some((session) => session.id === mapped)) {
        return { id: mapped, title: `稿件：${payload.filePath || ''}` };
      }
      const session = createSessionRecord(`稿件：${(payload.filePath || '').split('/').pop() || '新会话'}`);
      mapping[key] = session.id;
      writeJson(CONTEXT_SESSION_MAP_KEY, mapping);
      return session;
    }

    case 'chatrooms:list': {
      return listRooms();
    }
    case 'chatrooms:create': {
      const payload = (args[0] || {}) as { name?: string; advisorIds?: string[] };
      const room: ChatRoom = {
        id: randomId('room'),
        name: String(payload.name || '新聊天室'),
        advisorIds: Array.isArray(payload.advisorIds) ? payload.advisorIds : [],
        createdAt: nowIso(),
      };
      upsertRoom(room);
      writeJson(roomMessagesKey(room.id), []);
      return room;
    }
    case 'chatrooms:update': {
      const payload = (args[0] || {}) as { roomId?: string; name?: string; advisorIds?: string[] };
      const rooms = listRooms();
      const index = rooms.findIndex((room) => room.id === payload.roomId);
      if (index < 0) return { success: false, error: 'Room not found' };
      rooms[index] = {
        ...rooms[index],
        name: String(payload.name || rooms[index].name),
        advisorIds: Array.isArray(payload.advisorIds) ? payload.advisorIds : rooms[index].advisorIds,
      };
      writeJson(ROOMS_KEY, rooms);
      return { success: true, room: rooms[index] };
    }
    case 'chatrooms:delete': {
      const roomId = String(args[0] || '');
      writeJson(ROOMS_KEY, listRooms().filter((room) => room.id !== roomId));
      localStorage.removeItem(roomMessagesKey(roomId));
      return { success: true };
    }
    case 'chatrooms:clear': {
      const roomId = String(args[0] || '');
      writeJson(roomMessagesKey(roomId), []);
      return { success: true };
    }
    case 'chatrooms:messages': {
      const roomId = String(args[0] || '');
      return readJson<any[]>(roomMessagesKey(roomId), []);
    }
    case 'chatrooms:send': {
      const payload = (args[0] || {}) as { roomId?: string; message?: string; clientMessageId?: string };
      const roomId = String(payload.roomId || '');
      const message = String(payload.message || '').trim();
      if (!roomId || !message) return { success: false, error: 'Invalid payload' };

      const current = readJson<any[]>(roomMessagesKey(roomId), []);
      const userMessage = {
        id: payload.clientMessageId || randomId('room-msg'),
        role: 'user',
        content: message,
        timestamp: nowIso(),
      };
      const advisorReply = {
        id: randomId('room-msg'),
        role: 'advisor',
        advisorId: 'advisor-1',
        advisorName: 'CarRed 助手',
        advisorAvatar: '🤖',
        content: `已收到：${message}`,
        timestamp: nowIso(),
      };

      writeJson(roomMessagesKey(roomId), [...current, userMessage, advisorReply]);
      emit('creative-chat:user-message', { roomId, message: userMessage });
      emit('creative-chat:done', { roomId });
      return { success: true };
    }

    case 'advisors:list': {
      return listAdvisors();
    }
    case 'advisors:create': {
      const payload = (args[0] || {}) as Partial<Advisor>;
      const next: Advisor = {
        id: randomId('advisor'),
        name: String(payload.name || '新智囊'),
        avatar: String(payload.avatar || '智'),
        personality: String(payload.personality || ''),
        prompt: String(payload.prompt || ''),
      };
      writeJson(ADVISORS_KEY, [...listAdvisors(), next]);
      return { success: true, id: next.id };
    }
    case 'advisors:update': {
      const payload = (args[0] || {}) as Partial<Advisor> & { id?: string };
      const id = String(payload.id || '');
      const list = listAdvisors();
      const index = list.findIndex((advisor) => advisor.id === id);
      if (index < 0) return { success: false, error: 'Advisor not found' };
      list[index] = { ...list[index], ...payload, id } as Advisor;
      writeJson(ADVISORS_KEY, list);
      return { success: true };
    }
    case 'advisors:delete': {
      const id = String(args[0] || '');
      writeJson(ADVISORS_KEY, listAdvisors().filter((advisor) => advisor.id !== id));
      return { success: true };
    }
    case 'advisors:upload-knowledge':
    case 'advisors:delete-knowledge': {
      return { success: false, error: 'Web 版本暂未迁移顾问知识文件管理' };
    }
    case 'advisors:optimize-prompt':
    case 'advisors:optimize-prompt-deep':
    case 'advisors:generate-persona': {
      return { success: false, error: 'Web 版本暂未迁移顾问提示词生成' };
    }
    case 'advisors:select-avatar': {
      return '';
    }

    case 'archives:list':
      return readJson<any[]>('carred.web.archives', []);
    case 'archives:create': {
      const payload = (args[0] || {}) as any;
      const list = readJson<any[]>('carred.web.archives', []);
      const item = { ...payload, id: randomId('archive'), createdAt: nowIso(), updatedAt: nowIso() };
      writeJson('carred.web.archives', [...list, item]);
      return item;
    }
    case 'archives:update': {
      const payload = (args[0] || {}) as any;
      const list = readJson<any[]>('carred.web.archives', []);
      const next = list.map((item) => item.id === payload.id ? { ...item, ...payload, updatedAt: nowIso() } : item);
      writeJson('carred.web.archives', next);
      return { success: true };
    }
    case 'archives:delete': {
      const id = String(args[0] || '');
      writeJson('carred.web.archives', readJson<any[]>('carred.web.archives', []).filter((item) => item.id !== id));
      return { success: true };
    }
    case 'archives:samples:list':
      return [];
    case 'archives:samples:create':
    case 'archives:samples:update':
    case 'archives:samples:delete':
      return { success: true };

    case 'memory:list':
      return readJson<any[]>(MEMORIES_KEY, []);
    case 'memory:add': {
      const payload = (args[0] || {}) as any;
      const list = readJson<any[]>(MEMORIES_KEY, []);
      const item = { ...payload, id: randomId('memory'), created_at: Date.now() };
      writeJson(MEMORIES_KEY, [item, ...list]);
      return item;
    }
    case 'memory:delete': {
      const id = String(args[0] || '');
      writeJson(MEMORIES_KEY, readJson<any[]>(MEMORIES_KEY, []).filter((item) => item.id !== id));
      return { success: true };
    }

    case 'wander:list-history':
      return readJson<any[]>(WANDER_HISTORY_KEY, []);
    case 'wander:delete-history': {
      const id = String(args[0] || '');
      writeJson(WANDER_HISTORY_KEY, readJson<any[]>(WANDER_HISTORY_KEY, []).filter((item) => item.id !== id));
      return { success: true };
    }
    case 'wander:get-random':
      return [
        { id: randomId('wander'), title: '行业趋势观察', summary: '从近期内容中提取高频主题' },
        { id: randomId('wander'), title: '爆款结构拆解', summary: '整理封面-标题-正文组合模式' },
      ];
    case 'wander:brainstorm': {
      const payload = Array.isArray(args[0]) ? args[0] : [];
      const response = {
        result: `基于 ${payload.length || 0} 条灵感，建议先做「选题聚类 -> 角度评估 -> 文案实验」。`,
        historyId: randomId('wander-history'),
      };
      const list = readJson<any[]>(WANDER_HISTORY_KEY, []);
      writeJson(WANDER_HISTORY_KEY, [{ id: response.historyId, result: response.result, createdAt: nowIso() }, ...list]);
      return response;
    }

    case 'media:list':
      return { assets: [] };
    case 'media:update':
    case 'media:bind':
      return { success: true };
    case 'media:open-root':
    case 'media:open':
      return { success: false, error: '浏览器环境不支持打开本地目录' };

    case 'knowledge:list':
    case 'knowledge:list-youtube':
      return [];
    case 'knowledge:delete':
    case 'knowledge:delete-youtube':
    case 'knowledge:retry-youtube-subtitle':
      return { success: true };
    case 'knowledge:transcribe':
      return { success: false, error: 'Web 版本暂未迁移转录能力' };

    case 'indexing:get-stats':
      return { totalStats: { vectors: 0, documents: 0 } };
    case 'indexing:rebuild-all':
    case 'indexing:rebuild-advisor':
    case 'indexing:clear-queue':
    case 'indexing:remove-item':
      return { success: true };

    case 'similarity:get-cache':
    case 'embedding:get-manuscript-cache':
      return null;
    case 'similarity:get-knowledge-version':
      return 'web-v1';
    case 'embedding:compute':
      return { success: false, error: 'Embedding service not configured' };
    case 'embedding:get-sorted-sources':
      return { success: true, sources: [] };
    case 'embedding:save-manuscript-cache':
    case 'similarity:save-cache':
      return { success: true };

    case 'skills:create':
    case 'skills:save': {
      const payload = (args[0] || {}) as { name?: string };
      const list = readJson<Array<{ name: string; disabled?: boolean }>>(SKILLS_KEY, []);
      const name = String(payload.name || '').trim();
      if (name && !list.some((item) => item.name === name)) {
        list.push({ name, disabled: false });
        writeJson(SKILLS_KEY, list);
      }
      return { success: true, location: `/skills/${name || 'new'}` };
    }
    case 'skills:disable':
    case 'skills:enable': {
      const payload = (args[0] || {}) as { name?: string };
      const targetName = String(payload.name || '');
      const disabled = channel === 'skills:disable';
      const list = readJson<Array<{ name: string; disabled?: boolean }>>(SKILLS_KEY, []);
      writeJson(
        SKILLS_KEY,
        list.map((item) => item.name === targetName ? { ...item, disabled } : item),
      );
      return { success: true };
    }
    case 'skills:market-install': {
      const payload = (args[0] || {}) as { slug?: string };
      const slug = String(payload.slug || '').trim();
      if (!slug) return { success: false, error: 'slug is required' };
      const list = readJson<Array<{ name: string; disabled?: boolean }>>(SKILLS_KEY, []);
      if (!list.some((item) => item.name === slug)) {
        list.push({ name: slug, disabled: false });
        writeJson(SKILLS_KEY, list);
      }
      return { success: true, displayName: slug };
    }

    case 'redclaw:list-projects':
      return [];

    case 'xhs:save-note':
      return { success: false, error: 'Web 版本暂未接入红书采集' };

    case 'image-gen:generate': {
      await notMigrated('生图转发接口');
      return { success: false };
    }

    default:
      console.warn(`[browser-ipc] Unhandled invoke channel: ${channel}`);
      return { success: false, error: `Unhandled channel: ${channel}` };
  }
};

const chatApi = {
  send: async (payload: ChatSendPayload) => {
    let sessionId = payload.sessionId;
    if (!sessionId) {
      const created = createSessionRecord('New Chat');
      sessionId = created.id;
      emit('chat:session-title-updated', { sessionId, title: created.title });
    }

    touchSession(sessionId);
    appendMessage(sessionId, {
      role: 'user',
      content: payload.message,
      display_content: payload.displayContent,
      attachment: payload.attachment,
    });

    const abortController = new AbortController();
    setRuntime(sessionId, {
      isProcessing: true,
      partialResponse: '',
      abortController,
    });

    try {
      if (!API_BASE) {
        throw new Error('VITE_API_BASE_URL is not configured');
      }

      const submit = await requestJson(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: payload.message,
          model: (payload.modelConfig as any)?.model || undefined,
        }),
        signal: abortController.signal,
      }) as any;

      const taskId = String(submit?.task_id || '');
      if (!taskId) {
        throw new Error('Missing task id');
      }

      emit('chat:phase-start', { name: 'Executing' });
      const task = await pollTask(taskId, abortController.signal);
      const assistantText = parseTaskAssistantText(task);

      await chunkText(sessionId, assistantText);
      appendMessage(sessionId, {
        role: 'assistant',
        content: assistantText,
      });

      setRuntime(sessionId, {
        isProcessing: false,
        partialResponse: '',
        abortController: undefined,
      });
      emit('chat:response-end', { sessionId });
      emit('chat:done', { sessionId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== 'cancelled') {
        emit('chat:error', { message });
      }
      setRuntime(sessionId, {
        isProcessing: false,
        partialResponse: '',
        abortController: undefined,
      });
      emit('chat:response-end', { sessionId });
    }
  },

  cancel: (data?: { sessionId?: string } | string) => {
    const sessionId = typeof data === 'string'
      ? data
      : (typeof data === 'object' && data ? data.sessionId : undefined);

    if (sessionId) {
      const runtime = chatRuntimeBySession.get(sessionId);
      runtime?.abortController?.abort();
      setRuntime(sessionId, { isProcessing: false, partialResponse: '', abortController: undefined });
      emit('chat:response-end', { sessionId });
      return;
    }

    for (const [sid, runtime] of chatRuntimeBySession.entries()) {
      runtime.abortController?.abort();
      setRuntime(sid, { isProcessing: false, partialResponse: '', abortController: undefined });
      emit('chat:response-end', { sessionId: sid });
    }
  },

  confirmTool: () => {
    // No-op in browser bridge for now
  },

  getSessions: async () => readSessions(),

  createSession: async (title?: string) => createSessionRecord(title || 'New Chat'),

  getOrCreateContextSession: async (params: { contextId: string; contextType: string; title: string; initialContext: string }) => {
    const key = `${params.contextType}:${params.contextId}`;
    const mapping = readJson<Record<string, string>>(CONTEXT_SESSION_MAP_KEY, {});
    const existing = mapping[key];
    if (existing && readSessions().some((session) => session.id === existing)) {
      return readSessions().find((session) => session.id === existing)!;
    }

    const created = createSessionRecord(params.title || 'Context Chat');
    mapping[key] = created.id;
    writeJson(CONTEXT_SESSION_MAP_KEY, mapping);
    if (params.initialContext) {
      appendMessage(created.id, {
        role: 'assistant',
        content: params.initialContext,
      });
    }
    return created;
  },

  deleteSession: async (sessionId: string) => {
    writeSessions(readSessions().filter((session) => session.id !== sessionId));
    localStorage.removeItem(`${CHAT_SESSIONS_KEY}.${sessionId}.messages`);
    return { success: true };
  },

  getMessages: async (sessionId: string) => readSessionMessages(sessionId),

  clearMessages: async (sessionId: string) => {
    writeSessionMessages(sessionId, []);
    touchSession(sessionId);
    return { success: true };
  },

  compactContext: async (_sessionId: string) => ({
    success: true,
    compacted: false,
    message: 'Web 版本暂未开启上下文压缩',
    compactRounds: 0,
    compactUpdatedAt: nowIso(),
  }),

  getContextUsage: async (sessionId: string) => {
    const messages = readSessionMessages(sessionId);
    const totalTokens = messages.reduce((sum, msg) => sum + Math.ceil((msg.content || '').length / 3), 0);
    const threshold = 24000;
    return {
      success: true,
      sessionId,
      contextType: 'default',
      messageCount: messages.length,
      compactRounds: 0,
      compactUpdatedAt: null,
      estimatedTotalTokens: totalTokens,
      compactThreshold: threshold,
      compactRatio: Math.min(1, totalTokens / threshold),
    };
  },

  getRuntimeState: async (sessionId: string) => {
    const runtime = chatRuntimeBySession.get(sessionId) || {
      isProcessing: false,
      partialResponse: '',
      updatedAt: Date.now(),
    };

    return {
      success: true,
      sessionId,
      isProcessing: runtime.isProcessing,
      partialResponse: runtime.partialResponse,
      updatedAt: runtime.updatedAt,
    };
  },
};

hydrateTokenFromHash();
ensureSpaces();
listAdvisors();

const browserIpcRenderer = {
  saveSettings: async (settings: Record<string, unknown>) => {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    writeJson(SETTINGS_KEY, merged);
    return { success: true };
  },
  getSettings: async () => ({ ...DEFAULT_SETTINGS, ...readJson<Record<string, unknown>>(SETTINGS_KEY, {}) }),
  getAppVersion: async () => 'web-preview',
  fetchModels: async () => [{ id: 'gpt-5' }, { id: 'gpt-4.1' }],
  detectAiProtocol: async (config: { protocol?: string }) => {
    const protocol = (config?.protocol || 'openai') as 'openai' | 'anthropic' | 'gemini';
    return { success: true, protocol };
  },
  testAiConnection: async (config: { protocol?: string }) => ({
    success: true,
    protocol: (config?.protocol || 'openai') as 'openai' | 'anthropic' | 'gemini',
    models: [{ id: 'gpt-5' }],
    message: 'Web 预检通过（占位）',
  }),
  startChat: () => {},
  cancelChat: () => chatApi.cancel(),
  confirmTool: () => {},

  listSkills: async () => readJson<Array<{ name: string; disabled?: boolean }>>(SKILLS_KEY, []).map((skill) => ({
    name: skill.name,
    description: '',
    disabled: Boolean(skill.disabled),
  })),

  on: (channel: string, func: Listener) => {
    const bucket = listeners.get(channel) || new Set<Listener>();
    bucket.add(func);
    listeners.set(channel, bucket);
  },
  off: (channel: string, func: Listener) => {
    const bucket = listeners.get(channel);
    if (!bucket) return;
    bucket.delete(func);
    if (bucket.size === 0) listeners.delete(channel);
  },
  removeAllListeners: (channel: string) => {
    listeners.delete(channel);
  },
  invoke: (channel: string, ...args: unknown[]) => handleInvoke(channel, ...args),

  checkYtdlp: async () => ({ installed: false, version: '', path: '' }),
  installYtdlp: async () => ({ success: false, error: '浏览器环境不支持安装 yt-dlp' }),
  updateYtdlp: async () => ({ success: false, error: '浏览器环境不支持更新 yt-dlp' }),
  fetchYoutubeInfo: async () => ({ success: false, error: 'Web 版本暂未迁移 YouTube 采集' }),
  downloadYoutubeSubtitles: async () => ({ success: false, error: 'Web 版本暂未迁移字幕下载' }),
  readYoutubeSubtitle: async () => ({ success: false, hasSubtitle: false, error: 'Web 版本暂未迁移字幕读取' }),

  refreshVideos: async () => ({ success: true, videos: [] }),
  getVideos: async () => ({ success: true, videos: [] }),
  downloadVideo: async () => ({ success: false, error: 'Web 版本暂未迁移视频下载' }),

  chat: chatApi,

  redclawRunner: {
    getStatus: async () => ({
      enabled: false,
      intervalMinutes: 20,
      keepAliveWhenNoWindow: false,
      maxProjectsPerTick: 1,
      maxAutomationPerTick: 2,
      isTicking: false,
      currentProjectId: null,
      currentAutomationTaskId: null,
      lastTickAt: null,
      nextTickAt: null,
      nextMaintenanceAt: null,
      lastError: null,
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        suppressEmptyReport: true,
        reportToMainSession: true,
      },
      scheduledTasks: {},
      longCycleTasks: {},
      projectStates: {},
    }),
    start: async () => ({ success: true }),
    stop: async () => ({ success: true }),
    runNow: async () => ({ success: true }),
    setProject: async () => ({ success: true }),
    setConfig: async () => ({ success: true }),
    listScheduled: async () => ({ success: true, tasks: [] }),
    addScheduled: async () => ({ success: true }),
    removeScheduled: async () => ({ success: true }),
    setScheduledEnabled: async () => ({ success: true }),
    runScheduledNow: async () => ({ success: true }),
    listLongCycle: async () => ({ success: true, tasks: [] }),
    addLongCycle: async () => ({ success: true }),
    removeLongCycle: async () => ({ success: true }),
    setLongCycleEnabled: async () => ({ success: true }),
    runLongCycleNow: async () => ({ success: true }),
  },

  mcp: {
    list: async () => ({ success: true, servers: [] }),
    save: async (servers: unknown[]) => ({ success: true, servers }),
    importLocal: async () => ({ success: true, servers: [], imported: 0, total: 0 }),
    test: async () => ({ success: true, message: 'Web 端暂不支持本地 MCP 连通性测试' }),
    oauthStatus: async () => ({ success: true, connected: false }),
  },
};

if (!(window as any).ipcRenderer) {
  (window as any).ipcRenderer = browserIpcRenderer;
}

export {};
