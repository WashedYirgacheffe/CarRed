export const TASK_STATUS = {
  queued: 'queued',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  canceled: 'canceled',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export type TaskKind =
  | 'chat_message'
  | 'workspace_index'
  | 'media_process'
  | 'fs_write'
  | 'fs_read'
  | 'fs_list';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export interface TaskRecord {
  id: string;
  user_id: string;
  kind: TaskKind;
  status: TaskStatus;
  input: JsonValue;
  output: JsonValue | null;
  error: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface ApiTaskCreateRequest {
  kind: TaskKind;
  input: Record<string, JsonValue>;
}

export interface ApiTaskCreateResponse {
  task_id: string;
  status: TaskStatus;
}

export interface FsOpRequest {
  op: 'read' | 'write' | 'list' | 'mkdir' | 'delete' | 'move';
  path?: string;
  to?: string;
  content?: string;
}
