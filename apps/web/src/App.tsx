import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import DashboardPage from './pages/DashboardPage';
import ChatPage from './pages/ChatPage';
import PlaceholderPage from './pages/PlaceholderPage';
import { hydrateTokenFromHash, readToken } from './lib/auth';

export default function App() {
  useEffect(() => {
    hydrateTokenFromHash();
  }, []);

  const token = readToken();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">CarRed</div>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/chat">Chat</Link>
          <Link to="/knowledge">Knowledge</Link>
          <Link to="/media">Media</Link>
          <Link to="/manuscripts">Manuscripts</Link>
          <Link to="/redclaw">RedClaw</Link>
        </nav>
        <div className="token-state">Auth: {token ? 'linked' : 'missing'}</div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/knowledge" element={<PlaceholderPage title="Knowledge" endpoint="POST /api/tasks (workspace_index)" note="将 RedBox 知识库索引流程迁移到 Worker 后在此接入。" />} />
          <Route path="/media" element={<PlaceholderPage title="Media" endpoint="POST /api/tasks (media_process)" note="媒体处理任务通过队列执行，结果回写 tasks/output。" />} />
          <Route path="/manuscripts" element={<PlaceholderPage title="Manuscripts" endpoint="POST /api/workspace/fs/*" note="文稿文件读写通过云端隔离工作区 API。" />} />
          <Route path="/redclaw" element={<PlaceholderPage title="RedClaw" endpoint="GET /api/tasks/:id/events" note="自动化流程在 Worker 执行并通过 SSE 反馈状态。" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
