# Development Guide

This guide is for developers who want to contribute to Rotato or run it locally for development.

## Tech Stack

- **Backend**: Node.js + Fastify (TypeScript), Prisma ORM, SQLite
- **Frontend**: React + Vite + TypeScript, Mantine UI, React Query
- **Build**: npm workspaces monorepo

## Repository Structure

```
rotato/
├── packages/
│   ├── api/           # Fastify backend server
│   │   ├── prisma/    # Database schema and migrations
│   │   └── src/
│   │       ├── routes/    # API endpoints
│   │       ├── services/  # Business logic
│   │       └── utils/     # Helper functions
│   └── web/           # React frontend
│       └── src/
│           ├── pages/     # Page components
│           ├── components/# Shared components
│           └── context/   # React context providers
├── docs/              # Documentation
├── assets/            # Images and icons
└── docker-compose.yml # Docker configuration
```

## Local Development Setup

### Prerequisites

- Node.js 20+
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/shadynafie/rotato.git
cd rotato

# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate --workspace api

# Seed the database (creates admin user and sample data)
npm run prisma:seed --workspace api
```

### Running Locally

```bash
# Run both API and web in development mode
npm run dev

# Or run them separately:
npm run dev:api  # API on port 3001
npm run dev:web  # Web on port 5173
```

### Environment Variables

Create `packages/api/.env`:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET=dev-secret-change-in-production
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### Default Login

- Email: `admin@example.com`
- Password: `admin123`

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Database schema |
| `src/server.ts` | Main server setup |
| `src/routes/schedule.ts` | Schedule computation API |
| `src/services/scheduleComputer.ts` | Core scheduling logic |
| `src/routes/leaves.ts` | Leave management |
| `src/routes/oncall.ts` | On-call cycle management |

### Frontend

| File | Purpose |
|------|---------|
| `src/main.tsx` | App entry, routing, providers |
| `src/pages/CalendarPage.tsx` | Main calendar view |
| `src/pages/PublicViewPage.tsx` | Public read-only view |
| `src/pages/Settings/*.tsx` | Settings pages |
| `src/api/client.ts` | API client with auth |

## Database

Rotato uses SQLite with Prisma ORM. The schema includes:

- **User** - Admin authentication
- **Clinician** - Consultants and registrars
- **Duty** - Types of duties (Clinic, Theatre, etc.)
- **JobPlanWeek** - Week 1-5 templates per clinician
- **OncallCycle** - Rolling on-call schedules
- **Leave** - Leave records
- **ShareToken** - Public access tokens
- **AuditLog** - Change history

### Migrations

```bash
# Create a new migration
npx prisma migrate dev --name your_migration_name --schema=packages/api/prisma/schema.prisma

# Apply migrations
npx prisma migrate deploy --schema=packages/api/prisma/schema.prisma
```

## Building for Production

```bash
# Build both packages
npm run build

# The outputs are:
# - packages/api/dist/     (compiled API)
# - packages/web/dist/     (static web files)
```

## Docker Build

```bash
# Build locally
docker build -t rotato:local .

# Run locally built image
docker run -p 3001:3001 -v ./data:/data -e JWT_SECRET=test rotato:local
```

## Code Style

- TypeScript strict mode
- ESLint + Prettier configured
- UK date format (dd/mm/yyyy)
- 12-hour clock format

```bash
# Lint
npm run lint

# Format
npm run format
```

## API Endpoints

See `api/openapi.yaml` for the full API specification.

Key endpoints:
- `POST /api/auth/login` - Authentication
- `GET /api/schedule` - Get computed schedule
- `GET /api/clinicians` - List clinicians
- `POST /api/leaves/bulk` - Add leave dates
- `GET /api/public/:token/schedule` - Public schedule access
