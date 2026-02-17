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
- `src/utils/formatters.ts` - Shared formatting utilities (see below)
- `src/utils/constants.ts` - Shared constants (LEAVE_TYPES, SESSIONS, COLORS)

### Rota Generation Logic
1. Job plans define Week 1-5 templates per clinician (AM/PM duties)
2. On-call uses slot-based system: abstract slots (Registrar 01-07, Consultant 01-07) with assignments
3. Generator projects templates onto dates, creating RotaEntry records
4. Entries with `source='manual'`, `source='leave'`, or `source='rest'` are never overwritten
5. `session` can be 'AM', 'PM', or 'FULL' (on-call spans full day)
6. Registrar rest days are auto-calculated based on on-call (weekend → Fri/Mon/Tue off, weekday → next day AM=SPA, PM=off)

### Slot-Based On-Call System
- **OnCallSlot**: Abstract positions (Registrar 01-07, Consultant 01-07)
- **SlotAssignment**: Maps clinicians to slots with `effectiveFrom`/`effectiveTo` date ranges
- **OnCallConfig**: Role-level config (cycle length, start date)
- **OnCallPattern**: Explicit 49-day pattern for registrars (consultants use implicit week-position mapping)
- Staff changes only require updating assignments; patterns remain stable

## Data Model Key Points

SQLite doesn't support enums, so these are stored as strings:
- `ClinicianRole`: 'consultant' | 'registrar'
- `Session`: 'AM' | 'PM' | 'FULL'
- `RotaSource`: 'jobplan' | 'oncall' | 'manual' | 'leave' | 'rest'
- `LeaveType`: 'annual' | 'study' | 'sick' | 'professional'
- `CoverageReason`: 'leave' | 'oncall_conflict' | 'manual'
- JSON fields (payload, before, after) are stored as serialized strings

RotaEntry uniqueness: `[date, clinicianId, session]`

### Coverage Request System
- Auto-created when registrar takes leave and has a duty (consultant-supporting or independent)
- `absentRegistrarId` tracks which registrar's absence caused the coverage need
- `consultantId` is optional (null for independent registrar duties like TULA)
- `supportingClinicianId` on RotaEntry links registrar manual assignments to consultants
- Auto-deleted when the associated leave is cancelled
- Cleanup endpoint: `POST /api/coverage/cleanup-orphaned` removes orphaned requests

### Coverage Suggester Scoring Algorithm
Smart suggestions for coverage assignment using unit pricing model (0-100 scale):

**Positive factors (more available = higher score):**
- Days since last coverage: +2 pts/day (cap 30 days = +60 max)
- Days since last on-call: +1 pt/day (cap 30 days = +30 max)

**Negative factors (busier = lower score):**
- On-calls in 30 days: -8 pts each (counts unique dates, not AM/PM entries)
- Duties in 30 days: -3 pts each
- Coverages in 30 days: -5 pts each
- Covered in last 3 days: -15 pts penalty
- Covered yesterday: additional -10 pts penalty

**Normalization:** Raw score mapped from [-150, +90] to [0, 100] with clamping.
- Forgotten registrar (no activity): ~100
- Extremely busy registrar: ~0

Key implementation notes:
- "Days since" queries only look at PAST dates (not future assignments)
- On-call counts use distinct dates (on-call spans full day with AM+PM entries)

## Environment

Create `packages/api/.env`:
```
DATABASE_URL="file:./dev.db"
JWT_SECRET=dev-secret-change-in-production
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

Default login: `admin@example.com` / `admin123`

## Shared Utilities (Single Source of Truth)

### Formatting Functions (`packages/web/src/utils/formatters.ts`)
Use these instead of inline implementations:
- `getSurname(fullName)` - Extract surname: "John Smith" → "Smith"
- `formatLeaveLabel(leaveType)` - Format leave: "annual" → "Annual Leave"
- `formatDutyDisplay(dutyName, supportingClinicianName, isRegistrar)` - For registrars: "Smith Clinic"
- `formatDateShort(dateStr)` - "15 Feb 2026"
- `formatDateWithWeekday(dateStr)` - "Sat, 15 Feb 2026"
- `formatDateLong(dateStr)` - "Saturday, 15 February 2026"

### Constants (`packages/web/src/utils/constants.ts`)
- `LEAVE_TYPES` - Options for leave type selects
- `SESSIONS` - Options for session selects (FULL, AM, PM)
- `COLORS` - Semantic colors (primary, oncall, leave, leaveStudy, etc.)
- `getLeaveColors(leaveType)` - Returns color/bg for leave type (red for annual/sick, purple for study/professional)

### Date Helpers (`packages/api/src/utils/dateHelpers.ts` & `packages/web/src/utils/dateHelpers.ts`)
Shared date utilities to avoid duplication:
- `formatDateString(date)` / `getDateString(date)` - Format to YYYY-MM-DD
- `weekOfMonth(date)` - Week 1-5 for job plan matching
- `getDayOfWeek(date)` - Monday=1 to Sunday=7
- `isWeekday(date)` - True for Mon-Fri
- `dateRange(from, to)` - Generator yielding dates in range
- Web package has string-based variants (`addDaysStr`, `getWeekStartStr`, etc.) for timezone safety

### API Formatters (`packages/api/src/utils/formatters.ts`)
Backend versions of `getSurname`, `formatLeaveLabel`, `formatDutyDisplay` for iCal generation.

**Important**: When displaying registrar duties with a supporting consultant, always use the "Surname Duty" format (e.g., "Smith Clinic"). Use `formatDutyDisplay()` for consistency.

## Public Routes (No Auth Required)

### Subscribe Flow (`/subscribe`)
Mobile-friendly QR code onboarding for clinicians to add their personal calendar:
1. Scan QR code → Select grade (Consultant/Registrar) → Select name → Add to calendar
2. URLs are built **client-side** using `window.location.origin` (never server-side)
3. API endpoints: `/subscribe/clinicians`, `/subscribe/token`

### iCal Generation (`/public/:token/ical`)
- Uses `ics` library with **namespace import**: `import * as ics from 'ics'` (no default export)
- All-day events must calculate next day using Date objects to handle month boundaries:
  ```typescript
  const nextDay = new Date(year, month - 1, day + 1);
  end: [nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate()]
  ```
- Never use `day + 1` directly as it fails on month-end dates (e.g., March 31 → March 32)

### Other Public Endpoints
- `/public/:token/schedule` - Computed schedule JSON
- `/public/:token/oncall-today` - Today's on-call clinicians
- `/view/:token` - Public calendar view page

## Conventions

- UK date format (dd/mm/yyyy), 12-hour clock, Europe/London timezone
- All mutations logged to AuditLog with before/after snapshots (as JSON strings)
- Public endpoints use high-entropy share tokens for read-only access
