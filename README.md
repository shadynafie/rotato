# Rota Manager

Web app for a single clinical team (consultants & registrars) to manage rota duties with admin-only editing and public read-only access.

## Capabilities
- **Auth & Roles**: Single admin login (email/password). Public tokenized link for read-only web view and iCal feed.
- **Clinicians & Duties**: CRUD for clinicians (consultant/registrar) and duty catalogue. Notification toggles stored per clinician.
- **Job Plans**: Week 1–5 template per clinician with AM/PM duties; repeats monthly.
- **On-call Cycles**: Rolling templates (e.g., 7-week consultants, daily registrars) with configurable cycle length and slots.
- **Rota Generation**: Fills AM/PM sessions from job plans and on-call cycles; on-call spans full day. Admin can override any entry or mark leave (annual/study/sick/professional). Generation is idempotent and respects manual/leave overrides.
- **Views**: Calendar page (day/week/month planned; basic list view wired) with role/clinician filters and range selection. UK date format (dd/mm/yyyy), 12-hour clock.
- **Notifications**: Email + stubbed WhatsApp recorded in DB on rota changes; test endpoint available.
- **Audit Trail**: All mutations to settings/rota logged with before/after snapshots.
- **Public Sharing**: Create share tokens; read-only calendar JSON and iCal feed via token.

## Architecture & Tech Stack
- **Backend**: Node.js + Fastify (TypeScript), Prisma ORM. SQLite-first (simplest local/dev); swap to Postgres later if needed. JWT auth. Routes under `packages/api/src/routes`.
- **Frontend**: React + Vite + TypeScript, Mantine UI, React Query, Axios. Auth context with protected routes. Pages under `packages/web/src/pages`.
- **Build/Tooling**: npm workspaces (root `package.json`), TypeScript base config, ESLint + Prettier, Vite dev server for web. Env via `.env` (see `packages/api/.env.example`).
- **Docs**: High-level architecture in `docs/architecture.md`; API contract draft in `api/openapi.yaml`; SQL sketch in `db/schema.sql`.

## Repository Layout
- `packages/api` — Fastify server, Prisma schema, routes, services, seed script.
- `packages/web` — React app, layout, pages, API client.
- `db/schema.sql` — SQL reference schema (mirrors Prisma).
- `docs/architecture.md` — system design overview.
- `api/openapi.yaml` — REST surface draft.

## Important Backend Files
- `packages/api/prisma/schema.prisma` — data model (clinicians, duties, jobPlanWeeks, oncallCycles, rotaEntries, leaves, notifications, auditLog, shareTokens).
- `packages/api/src/services/rotaGenerator.ts` — applies job plans/on-call to date ranges, respecting overrides/leaves.
- Routes:
  - Auth: `routes/auth.ts`
  - Clinicians: `routes/clinicians.ts`
  - Duties: `routes/duties.ts`
  - Job plans: `routes/jobPlans.ts`
  - On-call cycles: `routes/oncall.ts`
  - Rota list/generate/override: `routes/rota.ts`
  - Leaves: `routes/leaves.ts`
  - Notifications stub: `routes/notifications.ts`
  - Share tokens & public endpoints (calendar + iCal): `routes/shareTokens.ts`, `routes/public.ts`
  - Audit log: `routes/audit.ts`

## Important Frontend Files
- `src/main.tsx` — routing, providers (Mantine, React Query, Auth).
- `src/layout/MainLayout.tsx` — nav/shell with logout.
- `src/api/client.ts` — Axios instance with JWT header.
- Pages: `LoginPage`, `CalendarPage`, `Settings/CliniciansPage`, `Settings/DutiesPage`, `Settings/JobPlansPage`, `Settings/OncallPage`, `Settings/ShareTokensPage`.

## Docker Deployment (Recommended)

The easiest way to deploy Rota Manager is using Docker. A single container serves both the API and web frontend.

### Quick Start with Docker Compose

```bash
# Clone the repository
git clone https://github.com/shadynafie/rotato.git
cd rotato

# Create data directory for persistent database
mkdir -p data

# Set your JWT secret (required for production)
export JWT_SECRET="your-secure-random-secret-here"

# Start the container
docker-compose up -d
```

The app will be available at `http://localhost:3001`

**Default login:** `admin@example.com` / `admin123`

### Docker Run (Alternative)

```bash
# Pull the image from GitHub Container Registry
docker pull ghcr.io/shadynafie/rotato:latest

# Run with persistent data
docker run -d \
  --name rota-manager \
  -p 3001:3001 \
  -v $(pwd)/data:/data \
  -e JWT_SECRET="your-secure-random-secret-here" \
  ghcr.io/shadynafie/rotato:latest
```

### Portainer Stack

```yaml
version: '3.8'

services:
  rota-manager:
    image: ghcr.io/shadynafie/rotato:latest
    container_name: rota-manager
    ports:
      - "3001:3001"
    volumes:
      - /path/to/your/data:/data
    environment:
      - JWT_SECRET=your-secure-random-secret-here
      - CORS_ORIGIN=*
    restart: unless-stopped
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Port the server listens on |
| `JWT_SECRET` | - | **Required.** Secret for JWT signing |
| `DATABASE_URL` | `file:/data/rota.db` | SQLite database path |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |

### Data Persistence

The SQLite database is stored in `/data/rota.db` inside the container. Map this to a host directory to persist data across container restarts:

```bash
-v /your/host/path:/data
```

## Local Development Setup

1. Install deps: `npm install`
2. Generate Prisma client: `npm run prisma:generate --workspace api`
3. Apply schema & seed (creates admin `admin@example.com / admin123` and share token):
   `npm run prisma:seed --workspace api`
4. Run API: `npm run dev:api` (defaults to port 3001; configure via `.env`)
5. Run web: `npm run dev` (Vite on 5173; expects `VITE_API_BASE_URL` pointing to API)

## Environment (Local Development)
- `packages/api/.env.example` documents: `DATABASE_URL` (defaults to `file:./dev.db` for SQLite), `JWT_SECRET`, `PORT`, `CORS_ORIGIN`.
- Default time/date: UK format, 12-hour clock; timezone default Europe/London (configure in code if needed).
