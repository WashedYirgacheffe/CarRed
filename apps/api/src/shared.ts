export const TASK_STATUS = {
  queued: 'queued',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  canceled: 'canceled',
} as const;

export interface ApiTaskCreateRequest {
  kind: 'chat_message' | 'workspace_index' | 'media_process' | 'fs_write' | 'fs_read' | 'fs_list';
  input: Record<string, unknown>;
}
