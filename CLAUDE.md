# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rota Manager is a clinical team scheduling web app for managing consultant and registrar rota duties. Single admin edits; public tokenized read-only access for calendar and iCal feeds. Designed to run as a single Docker container with embedded SQLite.

## Commands

```bash
# First-time setup
npm install
npm run prisma:generate --workspace api
npm run prisma:seed --workspace api

# Development (runs both API and web)
npm run dev

# Build & lint
npm run build
npm run lint
```

## Architecture

**Monorepo with npm workspaces**: `packages/api` (Fastify backend) and `packages/web` (React frontend).

### Backend (packages/api)
- **Fastify + TypeScript** with JWT auth, Zod validation
- **Prisma ORM** with SQLite (file: `prisma/dev.db`)
- Key files:
  - `prisma/schema.prisma` - Data model (uses strings for enum-like fields since SQLite doesn't support enums)
  - `src/types/enums.ts` - TypeScript type definitions for enum values
  - `src/services/rotaGenerator.ts` - Core logic: applies job plans and on-call cycles to date ranges
  - `src/routes/` - REST endpoints

### Frontend (packages/web)
- **React + Vite + TypeScript**, Mantine UI, React Query
- `src/api/client.ts` - Axios with JWT header injection
- `src/context/AuthContext.tsx` - Auth state management

### Rota Generation Logic
1. Job plans define Week 1-5 templates per clinician (AM/PM duties)
2. On-call cycles define rolling schedules per role (consultant/registrar)
3. Generator projects templates onto dates, creating RotaEntry records
4. Entries with `source='manual'` or `source='leave'` are never overwritten
5. `session` can be 'AM', 'PM', or 'FULL' (on-call spans full day)

## Data Model Key Points

SQLite doesn't support enums, so these are stored as strings:
- `ClinicianRole`: 'consultant' | 'registrar'
- `Session`: 'AM' | 'PM' | 'FULL'
- `RotaSource`: 'jobplan' | 'oncall' | 'manual' | 'leave'
- `LeaveType`: 'annual' | 'study' | 'sick' | 'professional'
- JSON fields (payload, before, after) are stored as serialized strings

RotaEntry uniqueness: `[date, clinicianId, session]`

## Environment

Create `packages/api/.env`:
```
DATABASE_URL="file:./dev.db"
JWT_SECRET=dev-secret-change-in-production
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

Default login: `admin@example.com` / `admin123`

## Conventions

- UK date format (dd/mm/yyyy), 12-hour clock, Europe/London timezone
- All mutations logged to AuditLog with before/after snapshots (as JSON strings)
- Public endpoints use high-entropy share tokens for read-only access
