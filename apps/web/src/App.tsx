import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { saveToken } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { Layout } from './components/Layout';
import { Chat } from './pages/Chat';
import { CreativeChat } from './pages/CreativeChat';
import { Skills } from './pages/Skills';
import { Knowledge } from './pages/Knowledge';
import { Advisors } from './pages/Advisors';
import { Settings } from './pages/Settings';
import { Manuscripts } from './pages/Manuscripts';
import { Archives } from './pages/Archives';
import { Wander } from './pages/Wander';
import { XhsBrowser } from './pages/XhsBrowser';
import { RedClaw } from './pages/RedClaw';
import { MediaLibrary } from './pages/MediaLibrary';
import { ImageGen } from './pages/ImageGen';

export type ViewType = 'chat' | 'creative-chat' | 'skills' | 'knowledge' | 'advisors' | 'settings' | 'manuscripts' | 'archives' | 'wander' | 'xhs-browser' | 'redclaw' | 'media-library' | 'image-gen';

// 待发送的聊天消息（用于跨页面传递）
export interface PendingChatMessage {
  content: string;          // 实际发送给 AI 的完整内容
  displayContent?: string;  // UI 上显示的简短内容
  attachment?: {
    type: 'youtube-video';
    title: string;
    thumbnailUrl?: string;
    videoId?: string;
  };
}

function App() {
  // null = 初始化中，false = 未登录，true = 已登录
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('manuscripts');
  const [pendingChatMessage, setPendingChatMessage] = useState<PendingChatMessage | null>(null);
  const [pendingManuscriptFile, setPendingManuscriptFile] = useState<string | null>(null);
  const [xhsBrowserInitialized, setXhsBrowserInitialized] = useState(false);
  const [wanderInitialized, setWanderInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      // 优先：从 URL hash 读取 access_token（从 TapLater SSO 跳转而来）
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      if (hash.includes('access_token=')) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          const { data } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (data.session) {
            saveToken(data.session.access_token);
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            setAuthed(true);
            return;
          }
        }
      }

      // 其次：从 cookie/localStorage 读取已有 session
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        saveToken(data.session.access_token);
        setAuthed(true);
      } else {
        setAuthed(false);
      }
    };

    init();

    // 监听登录状态变化（登出时跳转回登录页）
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        saveToken(session.access_token);
        setAuthed(true);
      } else {
        setAuthed(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (currentView === 'xhs-browser') setXhsBrowserInitialized(true);
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'wander') setWanderInitialized(true);
  }, [currentView]);

  const navigateToChat = (message: PendingChatMessage) => {
    setPendingChatMessage(message);
    setCurrentView('chat');
  };

  const clearPendingMessage = () => setPendingChatMessage(null);

  const navigateToManuscript = (filePath: string) => {
    setPendingManuscriptFile(filePath);
    setCurrentView('manuscripts');
  };

  const clearPendingManuscriptFile = () => setPendingManuscriptFile(null);

  // 初始化中：空白等待
  if (authed === null) {
    return <div className="min-h-screen bg-[#1a1a1a]" />;
  }

  // 未登录：显示登录页
  if (authed === false) {
    return <LoginPage onLogin={(token) => { saveToken(token); setAuthed(true); }} />;
  }

  // 已登录：主界面
  return (
    <>
      <Layout currentView={currentView} onNavigate={setCurrentView}>
        {currentView === 'chat' && (
          <Chat
            pendingMessage={pendingChatMessage}
            onMessageConsumed={clearPendingMessage}
          />
        )}
        {currentView === 'creative-chat' && <CreativeChat />}
        {currentView === 'skills' && <Skills />}
        {currentView === 'knowledge' && <Knowledge onNavigateToChat={navigateToChat} />}
        {currentView === 'advisors' && <Advisors />}
        {currentView === 'settings' && <Settings />}
        {currentView === 'manuscripts' && (
          <Manuscripts
            pendingFile={pendingManuscriptFile}
            onFileConsumed={clearPendingManuscriptFile}
          />
        )}
        {currentView === 'archives' && <Archives />}
        {wanderInitialized && (
          <div className={currentView === 'wander' ? 'h-full min-h-0 flex flex-col' : 'hidden'}>
            <Wander onNavigateToManuscript={navigateToManuscript} />
          </div>
        )}
        {currentView === 'redclaw' && <RedClaw />}
        {currentView === 'media-library' && <MediaLibrary />}
        {currentView === 'image-gen' && <ImageGen />}
        {xhsBrowserInitialized && (
          <div className={currentView === 'xhs-browser' ? 'h-full min-h-0 flex flex-col' : 'hidden'}>
            <XhsBrowser />
          </div>
        )}
      </Layout>
    </>
  );
}

export default App;
