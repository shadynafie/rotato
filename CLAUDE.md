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

### Reusable Components (`packages/web/src/components/`)
Always use these shared components instead of inline implementations:

**Layout Components:**
- `PageHeader` - Page title, subtitle, and action buttons
- `TableCard` - Styled card wrapper for tables with optional header badge
- `EmptyState` - Icon, title, message, optional action for empty lists
- `LoadingSpinner` - Centered spinner with optional message

**Display Components:**
- `ColorDot` - Duty color indicator dot
- `ActionButtons` - Edit/delete button group with tooltips
- `RoleBadge`, `GradeBadge`, `ActiveBadge`, `SessionBadge`, `CoverageStatusBadge` - Status badges

**Icons (`components/Icons.tsx`):**
Export all SVG icons from here. Available: `AddIcon`, `EditIcon`, `DeleteIcon`, `CheckIcon`, `CloseIcon`, `CalendarIcon`, `UserIcon`, `UsersIcon`, `SaveIcon`, `PhoneIcon`, `ShareIcon`, `FileIcon`, `RefreshIcon`, `CopyIcon`, etc.

### Reusable Hooks (`packages/web/src/hooks/`)
**`useCRUDMutations<T>({ endpoint, queryKey, entityName })`**
Returns `createMutation`, `updateMutation`, `putMutation`, `deleteMutation` with automatic query invalidation and notifications.

**`useModalForm<T>({ defaultValues })`**
Returns `isOpen`, `editingId`, `isEditing`, `form`, `updateField`, `openCreate`, `openEdit`, `close` for modal state management.

### Backend Services (`packages/api/src/services/`)
- `oncallCalculator.ts` - Shared `getOncallClinicianForDate()` function used by both rotaGenerator and scheduleComputer
- `crudService.ts` - `createWithAudit()`, `updateWithAudit()`, `deleteWithAudit()` wrappers for consistent audit logging
- `scheduler.ts` - Automatic monthly rota regeneration using `node-cron`
- `coverageDetector.ts` - Detects coverage needs when registrars take leave
- `consultantImpactDetector.ts` - Handles consultant unavailability (frees registrars, creates consultant coverage requests)
- `coverageSuggester.ts` - Smart scoring algorithm for coverage assignment suggestions

### Rota Generation Logic
1. Job plans define Week 1-5 templates per clinician (AM/PM duties)
2. On-call uses slot-based system: abstract slots (Registrar 01-07, Consultant 01-07) with assignments
3. Generator projects templates onto dates, creating RotaEntry records
4. Entries with `source='manual'`, `source='leave'`, or `source='rest'` are never overwritten
5. `session` can be 'AM', 'PM', or 'FULL' (on-call spans full day)
6. Registrar rest days are auto-calculated based on on-call (weekend → Fri/Mon/Tue off, weekday → next day AM=SPA, PM=off)

### Automatic Rota Regeneration (Scheduler)
- Uses `node-cron` to run on the **1st of each month at 2:00 AM** (Europe/London timezone)
- Regenerates rota for **current month + 3 months ahead**
- Manual trigger available via `POST /api/rota/regenerate`
- Logs to AuditLog with `action: 'scheduled-regenerate'`
- Started automatically when server boots (`startScheduler()` in server.ts)

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
- **Only creates requests for duties with `requiresCoverage: true`** (Admin, SPA, MDT are excluded)
- `absentRegistrarId` tracks which registrar's absence caused the coverage need
- `absentConsultantId` tracks consultant coverage needs (when consultant is on-call or on leave)
- `consultantId` is optional (null for independent registrar duties like TULA)
- `supportingClinicianId` on RotaEntry links registrar manual assignments to consultants
- Auto-deleted when the associated leave is cancelled
- Cleanup endpoint: `POST /api/coverage/cleanup-orphaned` removes orphaned requests
- **Coverage types**: `registrar` (registrar covers registrar duty) or `consultant` (consultant covers consultant duty)

### Duty Configuration
- `requiresCoverage` (boolean, default: true) - Whether to create coverage requests when clinician is absent
- Set to `false` for non-clinical duties: Admin, SPA, MDT
- Coverage detection checks this flag before creating requests

### Coverage Page Filtering
- Filter chips for **Status** (Pending, Assigned, Cancelled)
- Filter chips for **Type** (Registrar, Consultant)
- Filter chips for **Reason** (On Leave, On-call Conflict, Manual)
- Default view shows only Pending requests
- Filter summary shows "Showing X of Y requests"

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

## Deployment Notes

### Database Migrations
When deploying schema changes:
1. **New columns with defaults**: Safe, existing data preserved
2. **Column renames**: Use `prisma db push` - drops old column, creates new one (data in that column is lost)
3. Always backup database before schema changes: `cp prisma/dev.db prisma/dev.db.backup`

### Docker Deployment
```bash
# Build and push
docker build -t your-registry/rota-manager:latest .
docker push your-registry/rota-manager:latest

# On VPS, after pulling new image:
docker compose down
docker compose up -d
```

### Post-Deployment Checklist
- Verify scheduler is running: Check logs for `[Scheduler] Monthly rota regeneration scheduled`
- If schema changed: Run `npx prisma db push` inside container
- If seed data needed: Run `npx prisma db seed` (updates Admin/SPA/MDT to requiresCoverage: false)

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
- **Always use reusable components** from `components/` instead of inline SVGs or styled boxes:
  - Use `PageHeader` for page titles (not inline `<Group>` with styled `<Text>`)
  - Use `LoadingSpinner` for loading states (not inline `<Loader>`)
  - Use `EmptyState` for empty data states (not inline styled boxes)
  - Use `ActionButtons` for edit/delete actions (not inline `<ActionIcon>` groups)
  - Use `TableCard` for table containers (not inline styled `<Box>`)
  - Import icons from `components/Icons.tsx` (not inline `<svg>`)
- **Always use reusable hooks** from `hooks/`:
  - Use `useCRUDMutations` for standard CRUD operations (not inline mutations)
  - Use `useModalForm` for modal state management (not inline useState calls)
