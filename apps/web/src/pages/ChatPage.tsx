import { useMemo, useState } from 'react';
import { api } from '../api/client';

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [taskId, setTaskId] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const sessionId = useMemo(() => `session-${Date.now()}`, []);

  const onSend = async () => {
    setError('');
    setStatus('submitting');
    try {
      const result = await api.sendChat(sessionId, input);
      setTaskId(result.task_id);
      setStatus(result.status || 'queued');

      const timer = setInterval(async () => {
        try {
          const task = await api.getTask(result.task_id);
          setStatus(task.status);
          if (['succeeded', 'failed', 'canceled'].includes(task.status)) {
            clearInterval(timer);
          }
        } catch (err) {
          clearInterval(timer);
          setError(err instanceof Error ? err.message : String(err));
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('failed');
    }
  };

  return (
    <div className="page narrow">
      <h1>Chat</h1>
      <p className="sub">`POST /api/chat/sessions/:id/messages` + queued worker</p>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入消息..." rows={8} />
      <button disabled={!input.trim()} onClick={onSend}>发送</button>
      <div className="status">Session: {sessionId}</div>
      <div className="status">Task: {taskId || '-'}</div>
      <div className="status">Status: {status}</div>
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
