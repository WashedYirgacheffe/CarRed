export const TASK_STATUS = {
  queued: 'queued',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  canceled: 'canceled',
} as const;

export type TaskKind =
  | 'chat_message'
  | 'workspace_index'
  | 'media_process'
  | 'fs_write'
  | 'fs_read'
  | 'fs_list';
