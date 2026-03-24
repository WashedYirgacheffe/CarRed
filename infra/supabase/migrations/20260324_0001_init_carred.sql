create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Default Space',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.archives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text,
  tags text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete set null,
  kind text not null,
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  progress integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  level text not null default 'info',
  message text not null,
  payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider text not null,
  endpoint text,
  model text,
  encrypted_secret text,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_spaces_user_id on public.spaces(user_id);
create index if not exists idx_chat_sessions_user_id on public.chat_sessions(user_id);
create index if not exists idx_chat_messages_session_created on public.chat_messages(session_id, created_at);
create index if not exists idx_archives_user_id on public.archives(user_id);
create index if not exists idx_media_assets_user_id on public.media_assets(user_id);
create index if not exists idx_tasks_user_status on public.tasks(user_id, status);
create index if not exists idx_task_logs_task_created on public.task_logs(task_id, created_at);
create index if not exists idx_ai_sources_user_id on public.ai_sources(user_id);

create trigger trg_spaces_updated_at
before update on public.spaces
for each row execute function public.set_updated_at();

create trigger trg_chat_sessions_updated_at
before update on public.chat_sessions
for each row execute function public.set_updated_at();

create trigger trg_archives_updated_at
before update on public.archives
for each row execute function public.set_updated_at();

create trigger trg_media_assets_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create trigger trg_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

create trigger trg_ai_sources_updated_at
before update on public.ai_sources
for each row execute function public.set_updated_at();

alter table public.spaces enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.archives enable row level security;
alter table public.media_assets enable row level security;
alter table public.tasks enable row level security;
alter table public.task_logs enable row level security;
alter table public.user_settings enable row level security;
alter table public.ai_sources enable row level security;

create policy spaces_owner_all on public.spaces
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy chat_sessions_owner_all on public.chat_sessions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy chat_messages_owner_all on public.chat_messages
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy archives_owner_all on public.archives
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy media_assets_owner_all on public.media_assets
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy tasks_owner_all on public.tasks
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy task_logs_owner_all on public.task_logs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy user_settings_owner_all on public.user_settings
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy ai_sources_owner_all on public.ai_sources
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
