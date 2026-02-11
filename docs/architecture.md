# Rota Manager Architecture

## Goals
- Single-admin editing with public read-only rota link.
- Templates for job plans (Week 1–5) and on-call cycles; auto-generate rota entries.
- Manual overrides: admin can replace any generated duty with leave/on-call/different duty.
- Notification hooks: email + stubbed WhatsApp.
- UK date format (dd/mm/yyyy), 12-hour clock.
- Audit trail for settings and rota changes.

## Tech Stack
- **Backend**: Node.js + Fastify (TypeScript). JWT auth, Zod validation, Prisma ORM (PostgreSQL prod, SQLite dev). Background jobs via bullmq + Redis (optional; fallback in-memory queue).
- **Frontend**: React + Vite + TypeScript. UI library: Mantine. Calendar: FullCalendar.
- **Build/Deploy**: Single repo, pnpm workspaces; Docker for prod. Env-config via dotenv.

## High-Level Components
- **Auth service**: Admin login; public tokenized share link for read-only views & iCal feed.
- **Settings service**: Clinicians CRUD, duty catalog, job-plan templates (Week1–5 per clinician), on-call cycles per role, notification toggles.
- **Rota engine**: Applies job plans and on-call cycles over dates; idempotent generate task fills gaps, respects leaves/overrides.
- **Rota API**: CRUD for rota entries; leave entries; filters by date range/role/clinician.
- **Notifications**: Email + stub WhatsApp sender; change events enqueue notifications; optional daily digest.
- **Audit**: Middleware records before/after for settings/rota mutations.
- **Public views**: Share-token endpoints for calendar JSON and iCal feed.

## Data Flow
1. Admin defines clinicians, duties, job-plan template (Week1–5) and on-call cycles (consultant weekly, registrar daily/weekend rotation).
2. Rota generator (cron/manual) projects templates onto dates; stores `rota_entries` per day+session. On-call marked `is_oncall=true` and uses `session=FULL` but appears in AM+PM views.
3. Admin can override any entry or mark leave; overrides replace generated items.
4. Notifications trigger on changes; WhatsApp is stubbed (logged), email uses provider (SendGrid/etc).
5. Users access read-only calendar via token link; iCal feed pulls the same data.

## Rota Generation Logic (outline)
- Inputs: date range [from, to], job_plan_weeks, oncall_cycles, leaves, existing overrides.
- For each date and clinician:
  - Compute `week_no` = 1..5 based on week-of-month (reset each calendar month).
  - Apply job plan duties for AM/PM.
  - Apply on-call rotation by role: offset = (date - cycle_start_date) mod cycle_length; pick clinician at that position; set `session=FULL`, `is_oncall=true`, duty null.
  - Skip/replace with leave if exists.
  - Do not overwrite entries marked `source=manual`.
- Write new rows only where none exist; keep idempotent.

## API Surface (draft)
- Auth: `POST /api/auth/login`.
- Clinicians: `GET/POST/PATCH/DELETE /api/clinicians`.
- Duties: `GET/POST/PATCH/DELETE /api/duties`.
- Job plans: `GET/PUT /api/job-plans` (per clinician, weeks 1–5).
- On-call cycles: `GET/PUT /api/oncall-cycles` (role, cycle length, ordered slots with clinician IDs).
- Rota generation: `POST /api/rota/generate` (body: from, to); `GET /api/rota` (filters: range, role, clinician, source).
- Rota entry override: `PATCH /api/rota/:id`.
- Leaves: `GET/POST/PATCH/DELETE /api/leaves`.
- Notifications: `POST /api/notifications/test`.
- Public: `GET /public/:token/calendar`, `GET /public/:token/ical`.
- Audit: `GET /api/audit` (admin only).

## Views (frontend)
- Login (admin).
- Rota Calendar (Day/Week/Month) with filters; badges for on-call; leave shading; inline edit modal for admin.
- Settings:
  - Clinicians list (role, email, active, notify toggle).
  - Duties catalog (label, color optional).
  - Job plan editor: 5 columns (Week1–5) per clinician, AM/PM duty selectors.
  - On-call editor: ordered list per role; set cycle length; drag reorder.
  - Notifications: toggle email/WhatsApp stub.
- Audit log table (who/what/when).

## Security & Roles
- Only admin user exists for write operations; JWT auth.
- Public token uses high-entropy random string; read-only routes only.

## Internationalization
- Date format dd/mm/yyyy; 12-hour times; timezone configurable (default Europe/London).

## Next Steps
- Finalize schema + migrations.
- Scaffold pnpm workspace with api and web packages.
- Implement auth + settings CRUD.
- Build rota generator service + tests.
- Add calendar UI + public link/iCal feed.
