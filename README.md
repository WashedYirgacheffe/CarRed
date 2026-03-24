# CarRed

CarRed is the web migration target of RedBox, deployed under `carred.carlab.top`.

## Architecture

- `apps/web`: React web client
- `apps/api`: Vercel Functions API gateway (JWT auth + task APIs + workspace APIs)
- `apps/worker`: Long-running worker for queued jobs
- `packages/shared`: Shared types and constants
- `infra/supabase`: SQL migrations and RLS policies

## Quick Start

1. Install dependencies:
   - `npm install`
2. Create env files for each app from `.env.example`
3. Run services:
   - Web: `npm run dev:web`
   - API: `npm run dev:api`
   - Worker: `npm run dev:worker`

## Deployment

- Web deploys to Vercel project `carred-web`
- API deploys to Vercel project `carred-api`
- Worker deploys to your container platform (Railway/Render/Fly.io)
- DNS: `carred.carlab.top -> cname.vercel-dns.com`
