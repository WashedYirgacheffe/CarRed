# CarRed Deployment Guide

## 1. Supabase

1. Run SQL migration:
   - `infra/supabase/migrations/20260324_0001_init_carred.sql`
2. Ensure Auth JWT issuer/keys are enabled (default Supabase setup).
3. Create storage buckets if needed for media assets.

## 2. API (Vercel)

Project root: `apps/api`

Required env:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `CARRED_WORKSPACE_ROOT`
- `CARRED_ALLOWED_ORIGIN=https://carred.carlab.top`

Core endpoints:
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `GET /api/tasks/:id/events`
- `POST /api/workspace/fs/:op`
- `POST /api/chat/sessions/:sessionId/messages`

## 3. Worker (Container)

Deploy `apps/worker` to a long-running container platform.

Required env:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`

Queue name: `carred-tasks`

## 4. Web (Vercel)

Project root: `apps/web`

Required env:
- `VITE_API_BASE_URL` (e.g. `https://api.carred.carlab.top`)

## 5. Domain

- `carred.carlab.top` -> web project
- `api.carred.carlab.top` -> api project
- DNS CNAME target for Vercel: `cname.vercel-dns.com`
