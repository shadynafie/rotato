#!/bin/sh
set -e

cd /app/packages/api

# Run Prisma migrations to create/update database schema
echo "Running database migrations..."
npx prisma migrate deploy --schema=prisma/schema.prisma

# Check if database needs seeding (if no users exist)
echo "Checking if database needs seeding..."
if npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.count().then(count => {
  process.exit(count === 0 ? 0 : 1);
}).catch(() => process.exit(0));
" 2>/dev/null; then
  echo "Seeding database with initial data..."
  npx tsx prisma/seed.ts
else
  echo "Database already has data, skipping seed."
fi

cd /app

# Start the application
echo "Starting Rota Manager on port ${PORT:-3001}..."
exec node packages/api/dist/server.js
